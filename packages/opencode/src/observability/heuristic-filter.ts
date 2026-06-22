import { Effect, Layer, Context } from "effect"
import type { TraceEvent } from "./trace-reporter"
import { Log } from "@/util"

const log = Log.create({ service: "heuristic-filter" })

export interface FilterDecision {
  readonly shouldKeep: boolean
  readonly reason?: string
}

export interface Interface {
  /**
   * Evaluates a trace event to determine if it should be kept for the evolution loop
   * or discarded because it's "dirty data" (e.g., OOM, Timeout, Infra failure).
   */
  readonly evaluate: (event: TraceEvent) => Effect.Effect<FilterDecision>
  
  /**
   * Filters a list of traces, returning only the clean ones.
   */
  readonly sanitize: (events: TraceEvent[]) => Effect.Effect<TraceEvent[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/HeuristicFilter") {}

// Known dirty error patterns that should not poison the model's memory
const DIRTY_PATTERNS = [
  // 基础设施错误
  /timeout/i,
  /killed\s+by\s+signal/i,
  /out\s+of\s+memory/i,
  /heap\s+limit/i,
  /enomem/i,
  /econnreset/i,
  /etimedout/i,
  /socket\s+hang\s+up/i,
  /network\s+error/i,
  /toolinterceptor\s+blocked/i, // Don't let it learn about our safety limits

  // API/限流错误
  /rate\s*limit/i,
  /quota\s*exceeded/i,
  /too\s*many\s*requests/i,
  /429/, // HTTP 429

  // 资源错误
  /insufficient\s*funds/i,
  /billing/i,
  /payment\s*required/i,

  // 模型错误
  /model\s*overloaded/i,
  /server\s*overloaded/i,
  /service\s*unavailable/i,
  /503/, // HTTP 503

  // 上下文错误
  /context\s*length\s*exceeded/i,
  /max\s*tokens\s*exceeded/i,
  /token\s*limit/i,
]

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const evaluate = Effect.fn("HeuristicFilter.evaluate")(function* (event: TraceEvent) {
      if (event.status !== "failed" && event.type !== "error") {
        return { shouldKeep: true }
      }

      const errorMessage = String(event.metadata?.error || event.metadata?.output || "")
      const exitCode = Number(event.metadata?.exitCode)

      // 1. Check Exit Codes for OOM (137) or Timeouts (124)
      if (exitCode === 137) {
        log.warn("filtering dirty trace (OOM/SigKill)", { id: event.id })
        return { shouldKeep: false, reason: "Process killed by OOM or SIGKILL (137)" }
      }
      if (exitCode === 124) {
        log.warn("filtering dirty trace (Timeout)", { id: event.id })
        return { shouldKeep: false, reason: "Process terminated due to timeout (124)" }
      }

      // 2. Heuristic Pattern Matching for network/infra issues
      if (errorMessage) {
        for (const pattern of DIRTY_PATTERNS) {
          if (pattern.test(errorMessage)) {
            log.warn("filtering dirty trace (Pattern Match)", { id: event.id, pattern: String(pattern) })
            return { shouldKeep: false, reason: `Matched infra error pattern: ${pattern}` }
          }
        }
      }

      // If it failed but doesn't look like an infra issue, it's likely a logic bug
      // and we WANT the model to learn from it.
      return { shouldKeep: true }
    })

    const sanitize = Effect.fn("HeuristicFilter.sanitize")(function* (events: TraceEvent[]) {
      const cleanEvents: TraceEvent[] = []
      
      for (const event of events) {
        const decision = yield* evaluate(event)
        if (decision.shouldKeep) {
          cleanEvents.push(event)
        }
      }
      
      return cleanEvents
    })

    return { evaluate, sanitize }
  })
)

export const defaultLayer = layer

export * as HeuristicFilter from "./heuristic-filter"