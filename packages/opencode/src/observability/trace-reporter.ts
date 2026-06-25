import { Effect, Layer, Context, Ref } from "effect"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { Log } from "@/util"
import { HeuristicFilter } from "./heuristic-filter"

const log = Log.create({ service: "trace-reporter" })

export const TraceNodeEvent = BusEvent.define(
  "observability.trace_node",
  z.object({
    id: z.string(),
    parentId: z.string().optional(),
    type: z.enum(["node_start", "node_end", "action", "decision", "error"]),
    name: z.string(),
    status: z.enum(["pending", "success", "failed"]),
    duration: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number()
  })
)

export type TraceEvent = z.infer<typeof TraceNodeEvent["properties"]>

export interface TraceConfig {
  /** 是否启用采样 */
  samplingEnabled: boolean
  /** 采样率 (0.0 - 1.0) */
  samplingRate: number
  /** 最大保留trace数量 */
  maxTraces: number
}

const DEFAULT_CONFIG: TraceConfig = {
  samplingEnabled: false,
  samplingRate: 1.0,
  maxTraces: 10000,
}

export interface Interface {
  readonly getTraces: () => Effect.Effect<TraceEvent[]>
  readonly emitTrace: (trace: Omit<TraceEvent, "timestamp">) => Effect.Effect<void>
  readonly getConfig: () => Effect.Effect<TraceConfig>
  readonly updateConfig: (config: Partial<TraceConfig>) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TraceReporter") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const traces = yield* Ref.make<TraceEvent[]>([])
    const configRef = yield* Ref.make<TraceConfig>(DEFAULT_CONFIG)
    const heuristicFilter = yield* HeuristicFilter.Service

    // Subscribe to trace node events to build the memory tree.
    yield* bus.subscribeCallback(TraceNodeEvent, (e) => {
      log.debug("trace.event.received", {
        id: e.properties.id,
        type: e.properties.type,
        name: e.properties.name,
        status: e.properties.status,
      })
      // HeuristicFilter: skip dirty data (OOM, timeout, infra errors)
      const decision = Effect.runSync(heuristicFilter.evaluate(e.properties))
      if (!decision.shouldKeep) {
        log.debug("trace.filtered", { id: e.properties.id, reason: decision.reason })
        return
      }
      Effect.runSync(Ref.update(traces, (list) => {
        const config = Effect.runSync(Ref.get(configRef))
        // 限制最大trace数量
        if (list.length >= config.maxTraces) {
          return [...list.slice(-config.maxTraces + 1), e.properties]
        }
        return [...list, e.properties]
      }))
    })

    const getTraces = Effect.fn("TraceReporter.getTraces")(function* () {
      const all = yield* Ref.get(traces)
      log.debug("trace.getTraces", { count: all.length })
      return all
    })

    const emitTrace = Effect.fn("TraceReporter.emitTrace")(function* (trace: Omit<TraceEvent, "timestamp">) {
      const config = yield* Ref.get(configRef)

      // 采样检查
      if (config.samplingEnabled && Math.random() > config.samplingRate) {
        log.debug("trace.sampled", { id: trace.id })
        return
      }

      log.info("trace.emit", {
        id: trace.id,
        type: trace.type,
        name: trace.name,
        status: trace.status,
        parentId: trace.parentId,
      })
      const fullTrace = { ...trace, timestamp: Date.now() }
      yield* bus.publish(TraceNodeEvent, fullTrace).pipe(Effect.catch(() => Effect.void))
    })

    const getConfig = Effect.fn("TraceReporter.getConfig")(function* () {
      return yield* Ref.get(configRef)
    })

    const updateConfig = Effect.fn("TraceReporter.updateConfig")(function* (newConfig: Partial<TraceConfig>) {
      yield* Ref.update(configRef, (current) => ({ ...current, ...newConfig }))
      log.info("trace.config.updated", newConfig)
    })

    return { getTraces, emitTrace, getConfig, updateConfig }
  })
)

export const defaultLayer = layer.pipe(Layer.provide(Bus.defaultLayer), Layer.provide(HeuristicFilter.defaultLayer))

interface TreeNode {
  id: string
  parentId?: string
  type: string
  name: string
  status: string
  duration?: number
  timestamp: number
  metadata?: Record<string, unknown>
  children: TreeNode[]
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = ((ms % 60_000) / 1000).toFixed(0)
  return `${m}m${s}s`
}

function statusIcon(status: string): string {
  if (status === "success") return "✓"
  if (status === "failed") return "✗"
  return "…"
}

function typeLabel(type: string): string {
  if (type === "node_start" || type === "node_end") return ""
  if (type === "action") return "[tool]"
  if (type === "decision") return "[decide]"
  if (type === "error") return "[error]"
  return ""
}

export function formatTree(events: TraceEvent[]): string {
  if (events.length === 0) return "(no trace events)"

  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const ev of events) {
    map.set(ev.id, { ...ev, children: [] })
  }
  for (const ev of events) {
    const node = map.get(ev.id)!
    if (ev.parentId && map.has(ev.parentId)) {
      map.get(ev.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const computeDuration = (node: TreeNode): number => {
    if (node.duration != null) return node.duration
    if (node.children.length === 0) return 0
    const childDurs = node.children.map(computeDuration)
    return childDurs.reduce((a, b) => a + b, 0)
  }

  const lines: string[] = []
  const render = (node: TreeNode, prefix: string, isLast: boolean) => {
    const connector = isLast ? "└── " : "├── "
    const icon = statusIcon(node.status)
    const label = typeLabel(node.type)
    const dur = formatDuration(computeDuration(node))
    const suffix = label ? ` ${label}` : ""
    lines.push(`${prefix}${connector}${icon} ${node.name}${suffix} (${dur})`)

    const childPrefix = prefix + (isLast ? "    " : "│   ")
    for (let i = 0; i < node.children.length; i++) {
      render(node.children[i], childPrefix, i === node.children.length - 1)
    }
  }

  for (let i = 0; i < roots.length; i++) {
    render(roots[i], "", i === roots.length - 1)
  }

  const totalMs = events.length
    ? Math.max(...events.map((e) => e.timestamp + (e.duration ?? 0))) - Math.min(...events.map((e) => e.timestamp))
    : 0
  const succeeded = events.filter((e) => e.status === "success").length
  const failed = events.filter((e) => e.status === "failed").length

  lines.push("")
  lines.push(`Total: ${formatDuration(totalMs)} | ${events.length} events | ✓${succeeded} ✗${failed}`)

  return lines.join("\n")
}

export * as TraceReporter from "./trace-reporter"
