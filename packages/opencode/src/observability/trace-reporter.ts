import { Effect, Layer, Context, Ref } from "effect"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { Log } from "@/util"

const log = Log.create({ service: "trace-reporter" })

export const TraceNodeEvent = BusEvent.define(
  "observability.trace_node",
  z.object({
    id: z.string(),
    parentId: z.string().optional(),
    type: z.enum(["node_start", "node_end", "action", "decision", "error"]),
    name: z.string(),
    status: z.enum(["pending", "success", "failed"]),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.number()
  })
)

export type TraceEvent = z.infer<typeof TraceNodeEvent["properties"]>

export interface Interface {
  readonly getTraces: () => Effect.Effect<TraceEvent[]>
  readonly emitTrace: (trace: Omit<TraceEvent, "timestamp">) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TraceReporter") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const traces = yield* Ref.make<TraceEvent[]>([])

    // Subscribe to trace node events to build the memory tree.
    yield* bus.subscribeCallback(TraceNodeEvent, (e) => {
      log.debug("trace.event.received", {
        id: e.properties.id,
        type: e.properties.type,
        name: e.properties.name,
        status: e.properties.status,
      })
      Effect.runSync(Ref.update(traces, (list) => [...list, e.properties]))
    })

    const getTraces = Effect.fn("TraceReporter.getTraces")(function* () {
      const all = yield* Ref.get(traces)
      log.debug("trace.getTraces", { count: all.length })
      return all
    })

    const emitTrace = Effect.fn("TraceReporter.emitTrace")(function* (trace: Omit<TraceEvent, "timestamp">) {
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

    return { getTraces, emitTrace }
  })
)

export const defaultLayer = layer.pipe(Layer.provide(Bus.defaultLayer))

export * as TraceReporter from "./trace-reporter"
