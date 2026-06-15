import { Effect, Layer, Context, Path } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { Git } from "@/git"
import { Log } from "@/util"
import { Global } from "@/global"
import { ChildProcessSpawner, ChildProcess } from "effect/unstable/process"
import * as Stream from "effect/Stream"

const log = Log.create({ service: "worktree-gc" })

export interface Interface {
  readonly sweep: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WorktreeGC") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const pathSvc = yield* Path.Path
    const gitSvc = yield* Git.Service
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

    const git = Effect.fnUntraced(
      function* (args: string[], opts?: { cwd?: string }) {
        const handle = yield* spawner.spawn(
          ChildProcess.make("git", args, { cwd: opts?.cwd, extendEnv: true, stdin: "ignore" }),
        )
        const [text, stderr] = yield* Effect.all(
          [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
          { concurrency: 2 },
        )
        const code = yield* handle.exitCode
        return { code, text, stderr }
      },
      Effect.scoped,
      Effect.catch((e) =>
        Effect.succeed({ code: 1, text: "", stderr: e instanceof Error ? e.message : String(e) }),
      ),
    )

    const isPidAlive = (pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch (e) {
        return false
      }
    }

    const sweep = Effect.fn("WorktreeGC.sweep")(function* () {
      log.info("starting orphan worktree sweep")
      const root = pathSvc.join(Global.Path.data, "worktree")
      
      const exists = yield* fs.exists(root).pipe(Effect.orDie)
      if (!exists) return

      const projects = yield* fs.readDirectory(root).pipe(
        Effect.catch(() => Effect.succeed([] as string[]))
      )
      
      for (const project of projects) {
        const projectDir = pathSvc.join(root, project)
        const worktrees = yield* fs.readDirectory(projectDir).pipe(
          Effect.catch(() => Effect.succeed([] as string[]))
        )
        
        for (const wt of worktrees) {
          const wtDir = pathSvc.join(projectDir, wt)
          const lockFile = pathSvc.join(wtDir, ".mimo-lock")
          
          const lockExists = yield* fs.exists(lockFile).pipe(Effect.orDie)
          if (!lockExists) {
            log.info("removing orphan worktree (no lock)", { directory: wtDir })
            yield* clean(wtDir)
            continue
          }
          
          const lockData = yield* fs.readFileString(lockFile).pipe(Effect.catch(() => Effect.succeed("")))
          const pidMatch = lockData.match(/PID=(\d+)/)
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10)
            if (!isPidAlive(pid)) {
              log.info("removing orphan worktree (dead pid)", { directory: wtDir, pid })
              yield* clean(wtDir)
            }
          }
        }
      }
    })

    const clean = Effect.fnUntraced(function* (directory: string) {
      // Best effort clean up via Git if it's a valid git worktree
      yield* git(["worktree", "remove", "--force", directory], { cwd: pathSvc.dirname(directory) })
        .pipe(Effect.catch(() => Effect.void))
      // Force remove directory
      yield* Effect.promise(() =>
        import("fs/promises").then((fsp) => fsp.rm(directory, { recursive: true, force: true }))
      ).pipe(Effect.catch(() => Effect.void))
    })

    return { sweep }
  })
)

import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { NodePath } from "@effect/platform-node"

export const defaultLayer = Layer.suspend(() => 
  layer.pipe(
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Git.defaultLayer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
    Layer.provide(NodePath.layer)
  )
)

export * as WorktreeGC from "./gc"
