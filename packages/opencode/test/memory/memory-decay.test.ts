import { expect, test, describe } from "bun:test"
import { Effect } from "effect"
import { MemoryDecay } from "@/memory/memory-decay"
import { AppRuntime } from "@/effect/app-runtime"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { SemanticHash } from "@/memory/semantic-hash"
import * as path from "path"
import * as os from "os"
import * as fsNode from "fs/promises"

describe("MemoryDecay", () => {
  test("filters out lines with decayed hash or missing files", async () => {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const decay = yield* MemoryDecay.Service
        const semanticHash = yield* SemanticHash.Service

        const dir = path.join(os.tmpdir(), "memory-decay-test-" + Date.now())
        yield* fs.ensureDir(dir)

        // Create a valid file
        const validContent = "function keepMe() {}"
        const validHash = yield* semanticHash.hashContent(validContent)
        yield* fs.writeWithDirs(path.join(dir, "valid.ts"), validContent)

        // Create a decayed file (content changed)
        const oldContent = "function original() {}"
        const oldHash = yield* semanticHash.hashContent(oldContent)
        yield* fs.writeWithDirs(path.join(dir, "changed.ts"), "function updated() {}")

        const memoryContent = [
          "# Memory Rules",
          `- [file: valid.ts] [hash: ${validHash}] Always keep me`,
          `- [file: changed.ts] [hash: ${oldHash}] I am decayed`,
          `- [file: missing.ts] [hash: abcdef123456] I don't exist`,
          "- This is a normal rule without hash"
        ].join("\n")

        const filtered = yield* decay.filterDecayed(memoryContent, dir)

        expect(filtered).toContain("Always keep me")
        expect(filtered).not.toContain("I am decayed")
        expect(filtered).not.toContain("I don't exist")
        expect(filtered).toContain("This is a normal rule without hash")

        yield* Effect.promise(() => fsNode.rm(dir, { recursive: true, force: true }))
      }).pipe(
        Effect.provide(MemoryDecay.defaultLayer),
        Effect.provide(SemanticHash.defaultLayer),
        Effect.provide(AppFileSystem.defaultLayer)
      )
    )
  })
})
