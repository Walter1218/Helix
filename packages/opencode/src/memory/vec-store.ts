import { eq, sql } from "drizzle-orm"
import { Database } from "../storage"
import { Embedder } from "./embedder"
import { MemoryVecTable } from "./vec.sql"
import { Log } from "../util"

const log = Log.create({ service: "vec-store" })

const COSINE_FLOOR = 0.45

export interface VecSearchRow {
  memory_path: string
  score: number
}

function bufferToFloat32Array(buf: Buffer): number[] {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
}

export class VecStore {
  public readonly embedder: Embedder

  constructor(embedder: Embedder) {
    this.embedder = embedder
  }

  get isEmbeddingEnabled(): boolean {
    return this.embedder.enabled
  }

  async indexOne(memoryPath: string, body: string): Promise<void> {
    if (!this.embedder.enabled) return
    try {
      const vec = await this.embedder.embed(body.slice(0, 8000))
      const blob = Buffer.from(new Float32Array(vec).buffer)
      Database.use((db) =>
        db
          .insert(MemoryVecTable)
          .values({ memory_path: memoryPath, embedding: blob, embedded_at: new Date().toISOString() })
          .onConflictDoUpdate({
            target: MemoryVecTable.memory_path,
            set: { embedding: blob, embedded_at: new Date().toISOString() },
          })
          .run(),
      )
    } catch (err) {
      log.warn("indexOne failed", { path: memoryPath, error: String(err) })
    }
  }

  async indexMany(items: Array<{ memoryPath: string; body: string }>): Promise<void> {
    if (!this.embedder.enabled || items.length === 0) return
    const bodies = items.map((i) => i.body.slice(0, 8000))
    const vecs = await this.embedder.embedBatch(bodies)
    const now = new Date().toISOString()

    Database.use((db) => {
      for (let i = 0; i < items.length; i++) {
        const blob = Buffer.from(new Float32Array(vecs[i]).buffer)
        db.insert(MemoryVecTable)
          .values({ memory_path: items[i].memoryPath, embedding: blob, embedded_at: now })
          .onConflictDoUpdate({
            target: MemoryVecTable.memory_path,
            set: { embedding: blob, embedded_at: now },
          })
          .run()
      }
    })
  }

  async search(queryText: string, limit = 5): Promise<VecSearchRow[]> {
    if (!this.embedder.enabled) return []
    try {
      const qVec = await this.embedder.embed(queryText)
      const rows = Database.use((db) => db.select().from(MemoryVecTable).all())

      const scored = rows
        .map((r) => {
          const vec = bufferToFloat32Array(r.embedding as Buffer)
          return { memory_path: r.memory_path, score: Embedder.cosine(qVec, vec) }
        })
        .filter((r) => r.score >= COSINE_FLOOR)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      return scored
    } catch (err) {
      log.warn("search failed", { error: String(err) })
      return []
    }
  }
}
