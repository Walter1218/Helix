import { expect, test, describe } from "bun:test"
import { Effect } from "effect"
import { ProjectProbe } from "@/project/probe"
import { AppRuntime } from "@/effect/app-runtime"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { InstanceState } from "@/effect"
import { InstanceRef } from "@/effect/instance-ref"
import * as path from "path"
import * as os from "os"
import * as fsNode from "fs/promises"

describe("ProjectProbe", () => {
  test("detects project constraints based on files", async () => {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const probe = yield* ProjectProbe.Service

        const dir = path.join(os.tmpdir(), "project-probe-test-" + Date.now())
        yield* fs.ensureDir(dir)

        // Setup mock project
        yield* fs.writeWithDirs(path.join(dir, "package.json"), JSON.stringify({
          dependencies: {
            "react": "^18.0.0"
          }
        }))
        yield* fs.writeWithDirs(path.join(dir, "pnpm-lock.yaml"), "")
        yield* fs.writeWithDirs(path.join(dir, "biome.json"), "{}")
        yield* fs.writeWithDirs(path.join(dir, "tsconfig.json"), "{}")

        // Set InstanceState context to point to our mock project
        const constraints = yield* probe.getConstraints().pipe(
          Effect.provideService(InstanceRef, {
            directory: dir,
            worktree: dir,
            branch: "main",
          } as any)
        )

        expect(constraints).toContain("This project uses pnpm. You MUST use 'pnpm' for installing dependencies and running scripts, NEVER use npm or yarn.")
        expect(constraints).toContain("This project uses React. Use functional components and hooks.")
        expect(constraints).toContain("This project uses Biome for linting and formatting. Ensure code modifications pass Biome checks.")
        expect(constraints).toContain("This is a TypeScript project. Always use proper static typing, avoid 'any', and ensure 'bun typecheck' or 'tsc' passes.")

        yield* Effect.promise(() => fsNode.rm(dir, { recursive: true, force: true }))
      }).pipe(
        Effect.provide(ProjectProbe.defaultLayer),
        Effect.provide(AppFileSystem.defaultLayer)
      )
    )
  })
})
