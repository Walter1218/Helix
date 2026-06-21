import { Context, Effect, Layer } from "effect"
import path from "path"
import os from "os"
import { Global } from "../global"
import { Database } from "../storage"
import { Config } from "../config"
import { reconcileMemory } from "./reconcile"
import { buildFtsQuery } from "./fts-query"
import { Embedder } from "./embedder"
import { VecStore } from "./vec-store"
import { Log } from "@/util"

const log = Log.create({ service: "memory" })

type SearchRow = {
  path: string
  scope: string
  scope_id: string
  type: string
  snippet: string
  score: number
}

export interface Interface {
  readonly root: () => Effect.Effect<string>
  readonly reconcile: () => Effect.Effect<{ indexed: number; pruned: number; embedded: number }>
  readonly search: (input: {
    query: string
    scope?: string
    scope_id?: string
    type?: string
    limit?: number
  }) => Effect.Effect<
    Array<{ path: string; snippet: string; score: number; scope: string; scope_id: string; type: string }>
  >
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

export const layer: Layer.Layer<Service, never, Config.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const root = path.join(Global.Path.data, "memory")
    const ccBase = path.join(os.homedir(), ".claude", "projects")

    // Lazy init embedder + vec store from config
    let vec: VecStore | undefined
    function getVec(cfg: Config.Info) {
      if (vec) return vec
      const vc = cfg.memory?.vector
      const embedder = new Embedder({
        enabled: vc?.enabled ?? true,
        baseUrl: vc?.api_url ?? "http://localhost:1234/v1/embeddings",
        model: vc?.model ?? "text-embedding-nomic-embed-text-v1.5",
      })
      vec = new VecStore(embedder)
      return vec
    }

    const rootEff = Effect.fn("Memory.root")(function* () {
      return root
    })

    const reconcile = Effect.fn("Memory.reconcile")(function* () {
      log.info("memory.reconcile.start")
      const cfg = yield* config.get()
      const cc = cfg.memory?.cc_index ? ccBase : undefined
      const v = getVec(cfg)

      // Collect newly indexed bodies for embedding
      const newBodies: Array<{ memoryPath: string; body: string }> = []

      const result = yield* Effect.promise(() =>
        reconcileMemory({
          mimo: root,
          cc,
          onNewIndex: (p, body) => {
            newBodies.push({ memoryPath: p, body })
          },
        }),
      )

      // Batch embed newly indexed files
      if (newBodies.length > 0) {
        log.info("memory.reconcile.embedding", { count: newBodies.length })
        yield* Effect.promise(() => v.indexMany(newBodies))
      }

      log.info("memory.reconcile.completed", {
        indexed: result.indexed,
        pruned: result.pruned,
        embedded: newBodies.length,
      })
      return { ...result, embedded: newBodies.length }
    })

    const search = Effect.fn("Memory.search")(function* (input: {
      query: string
      scope?: string
      scope_id?: string
      type?: string
      limit?: number
    }) {
      const startTime = Date.now()
      log.info("memory.search.start", {
        query: input.query.substring(0, 100),
        scope: input.scope,
        scope_id: input.scope_id,
        type: input.type,
        limit: input.limit,
      })
      const cfg = yield* config.get()
      if (cfg.checkpoint?.memory_reconcile_on_search ?? true) {
        const cc = cfg.memory?.cc_index ? ccBase : undefined
        const v = getVec(cfg)
        const newBodies: Array<{ memoryPath: string; body: string }> = []
        yield* Effect.promise(() =>
          reconcileMemory({
            mimo: root,
            cc,
            onNewIndex: (p, body) => {
              newBodies.push({ memoryPath: p, body })
            },
          }),
        )
        if (newBodies.length > 0) {
          log.info("memory.search.reconcile", { newIndexed: newBodies.length })
          yield* Effect.promise(() => v.indexMany(newBodies))
        }
      }

      const limit = input.limit ?? 10
      const ftsQuery = buildFtsQuery(input.query)
      if (!ftsQuery) {
        const duration = Date.now() - startTime
        log.info("memory.search.empty_query", { duration, status: "skipped" })
        return []
      }

      const floorRatio = cfg.checkpoint?.memory_search_score_floor ?? 0.15

      const conditions: string[] = []
      const params: string[] = []
      if (input.scope) {
        conditions.push("memory_fts.scope = ?")
        params.push(input.scope)
      }
      if (input.scope_id) {
        conditions.push("memory_fts.scope_id = ?")
        params.push(input.scope_id)
      }
      if (input.type) {
        conditions.push("memory_fts.type = ?")
        params.push(input.type)
      }
      const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : ""

      const sql = `
        SELECT memory_fts.path, memory_fts.scope, memory_fts.scope_id, memory_fts.type,
               snippet(memory_fts_idx, 0, '<<', '>>', '...', 32) AS snippet,
               bm25(memory_fts_idx) AS score
        FROM memory_fts_idx
        JOIN memory_fts ON memory_fts.id = memory_fts_idx.rowid
        WHERE memory_fts_idx MATCH ?
        ${whereClause}
        ORDER BY score
        LIMIT ?
      `

      const fetchLimit = Math.min(limit * 3, 50)
      const rows = Database.Client().$client.query(sql).all(ftsQuery, ...params, fetchLimit) as SearchRow[]

      const mapped = rows.map((r) => ({
        path: r.path,
        snippet: r.snippet,
        score: -r.score,
        scope: r.scope,
        scope_id: r.scope_id,
        type: r.type,
      }))
      if (mapped.length === 0) {
        const duration = Date.now() - startTime
        log.info("memory.search.no_results", { query: input.query.substring(0, 50), duration, status: "empty" })
        return []
      }

      const topScore = mapped[0].score
      const cutoff = floorRatio > 0 ? topScore * floorRatio : -Infinity
      const bm25Results = mapped.filter((r, i) => i === 0 || r.score >= cutoff)

      // ---- Hybrid: BM25 + Vector Rerank ----
      const v = getVec(cfg)
      if (v.isEmbeddingEnabled && bm25Results.length > 0) {
        const vecResults = yield* Effect.promise(() => v.search(input.query, limit))
        const vecScoreMap = new Map(vecResults.map((r) => [r.memory_path, r.score]))

        // Rerank BM25 results with vector scores
        const scored = bm25Results.map((r) => {
          const vScore = vecScoreMap.get(r.path) ?? 0
          // BM25 score * 0.6 + vector score * 0.4
          const combined = r.score * 0.6 + vScore * 0.4
          return { ...r, score: combined, _vScore: vScore }
        })

        // Sort by combined score, boost items that appear in both
        scored.sort((a, b) => {
          const aBoost = a._vScore > 0 ? 1.3 : 1
          const bBoost = b._vScore > 0 ? 1.3 : 1
          return b.score * bBoost - a.score * aBoost
        })

        const result = scored.slice(0, limit)
        const duration = Date.now() - startTime
        log.info("memory.search.completed", {
          query: input.query.substring(0, 50),
          bm25Count: bm25Results.length,
          vecCount: vecResults.length,
          resultCount: result.length,
          duration,
          status: "success",
        })
        return result
      }

      const result = bm25Results.slice(0, limit)
      const duration = Date.now() - startTime
      log.info("memory.search.completed", {
        query: input.query.substring(0, 50),
        bm25Count: bm25Results.length,
        resultCount: result.length,
        duration,
        status: "success",
      })
      return result
    })

    return Service.of({
      root: rootEff,
      reconcile,
      search,
    })
  }),
)

export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Config.defaultLayer)))
