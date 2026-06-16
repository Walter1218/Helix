import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { Snapshot } from "../snapshot"
import * as Project from "./project"
import * as Vcs from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance, type InstanceContext } from "./instance"
import { Log } from "@/util"
import { FileWatcher } from "@/file/watcher"
import { ShareNext } from "@/share"
import * as Effect from "effect/Effect"
import { Config } from "@/config"
import { Metrics } from "@/metrics"
import { Memory } from "@/memory"
import { WorktreeGC } from "@/worktree/gc"
import { WriterService, BackfillService } from "@/history"
import { InstanceRef } from "@/effect/instance-ref"

export const InstanceBootstrap = Effect.gen(function* () {
  const ctx = yield* InstanceRef
  Log.Default.info("bootstrapping", { directory: ctx?.directory ?? "unknown" })
  // everything depends on config so eager load it for nice traces
  yield* Config.Service.use((svc) => svc.get())
  // Plugin can mutate config so it has to be initialized before anything else.
  yield* Plugin.Service.use((svc) => svc.init())
  yield* Effect.all(
    [
      LSP.Service,
      ShareNext.Service,
      Format.Service,
      File.Service,
      FileWatcher.Service,
      Vcs.Service,
      Snapshot.Service,
      WriterService,
      BackfillService,
    ].map((s) => Effect.forkDetach(s.use((i) => i.init()))),
  ).pipe(Effect.withSpan("InstanceBootstrap.init"))

  yield* WorktreeGC.Service.use((svc) => svc.sweep()).pipe(
    Effect.catch((cause: unknown) =>
      Effect.sync(() => Log.Default.warn("WorktreeGC sweep failed", { cause: String(cause) }))
    ),
    Effect.forkDetach,
  )

  // Warm the FTS index off the boot path. Off-tool writes between
  // process invocations are picked up here without blocking startup;
  // a missing memory dir or partial sync must not fail boot.
  yield* Memory.Service.use((svc) => svc.reconcile()).pipe(
    Effect.catch((err: unknown) =>
      Effect.sync(() => Log.Default.warn("memory reconcile failed", { error: String(err) })),
    ),
    Effect.forkDetach,
  )

  yield* Bus.Service.use((svc) =>
    svc.subscribeCallback(Command.Event.Executed, async (payload) => {
      if (payload.properties.name === Command.Default.INIT) {
        if (ctx) Project.setInitialized(ctx.project.id)
      }
    }),
  )

  yield* Metrics.subscribe()
}).pipe(Effect.withSpan("InstanceBootstrap"))
