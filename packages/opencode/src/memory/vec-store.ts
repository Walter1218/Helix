import { Database } from "../storage"
import { Embedder } from "./embedder"
import { VEC0_CREATE_SQL } from "./vec.sql"
import { Log } from "../util"

const log = Log.create({ service: "vec-store" })

const COSINE_FLOOR = 0.45

export interface VecSearchRow {
  memory_path: string
  score: number
}

export class VecStore {
  private initialized = false

  constructor(private embedder: Embedder) {}

  async init() {
    if (this.initialized) return
    Database.Client().$client.run(VEC0_CREATE_SQL)
    this.initialized = true
  }

  async indexOne(memoryPath: string, body: string): Promise<void> {
    if (!this.embedder.enabled) return
    await this.init()
    try {
      const vec = await this.embedder.embed(body.slice(0, 8000))
      const blob = new Float32Array(vec)
      Database.Client().$client.run(
        `INSERT OR REPLACE INTO memory_vec_index(rowid, embedding)
         SELECT memory_fts.rowid, ?
         FROM memory_fts WHERE memory_fts.path = ?`,
        [blob, memoryPath],
      )
    } catch (err) {
      log.warn("indexOne failed", { path: memoryPath, error: String(err) })
    }
  }

  async indexMany(items: Array<{ memoryPath: string; body: string }>): Promise<void> {
    if (!this.embedder.enabled || items.length === 0) return
    await this.init()
    const bodies = items.map((i) => i.body.slice(0, 8000))
    const vecs = await this.embedder.embedBatch(bodies)

    const db = Database.Client().$client
    for (let i = 0; i < items.length; i++) {
      const blob = new Float32Array(vecs[i])
      db.run(
        `INSERT OR REPLACE INTO memory_vec_index(rowid, embedding)
         SELECT memory_fts.rowid, ?
         FROM memory_fts WHERE memory_fts.path = ?`,
        [blob, items[i].memoryPath],
      )
    }
  }

  async search(queryText: string, limit = 5): Promise<VecSearchRow[]> {
    if (!this.embedder.enabled) return []
    await this.init()
    try {
      const qVec = await this.embedder.embed(queryText)
      const blob = new Float32Array(qVec)

      const rows = Database.Client().$client
        .query(
          `SELECT memory_fts.path AS memory_path, distance
           FROM memory_vec_index
           JOIN memory_fts ON memory_fts.rowid = memory_vec_index.rowid
           WHERE embedding MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(blob, limit * 3) as Array<{ memory_path: string; distance: number }>

      return rows
        .map((r) => ({ memory_path: r.memory_path, score: 1 / (1 + r.distance) }))
        .filter((r) => r.score >= COSINE_FLOOR)
        .slice(0, limit)
    } catch (err) {
      log.warn("vec search failed", { error: String(err) })
      return []
    }
  }
}
