import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { SemanticHash } from "./semantic-hash"
import { Log } from "@/util"
import * as path from "path"

const log = Log.create({ service: "memory.decay" })

export interface Interface {
  /**
   * Evaluates memory contents and strips out lines/rules that have decayed.
   * Checks for [hash:xxx] tags, compares with current file semantic hashes,
   * and returns filtered content with warnings/logs for dropped rules.
   */
  readonly filterDecayed: (content: string, baseDir: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MemoryDecay") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const semanticHash = yield* SemanticHash.Service
    const fs = yield* AppFileSystem.Service

    const filterDecayed = Effect.fn("MemoryDecay.filterDecayed")(function* (content: string, baseDir: string) {
      if (!content.includes("[hash:")) return content

      const lines = content.split("\n")
      const validLines: string[] = []
      let decayedCount = 0

      for (const line of lines) {
        // Look for: - [file: src/foo.ts] [hash: 123456] Rule description
        const match = line.match(/\[file:\s*([^\]]+)\]\s*\[hash:\s*([a-f0-9]+)\]/)
        if (match) {
          const filepath = match[1]
          const expectedHash = match[2]
          
          const fullPath = path.resolve(baseDir, filepath)
          const exists = yield* fs.existsSafe(fullPath)
          
          if (!exists) {
            log.warn("memory decay: file no longer exists, dropping rule", { filepath })
            decayedCount++
            continue
          }

          const currentHash = yield* semanticHash.hashFile(fullPath)
          if (currentHash !== expectedHash) {
            log.warn("memory decay: semantic hash mismatch, dropping rule", { filepath, expectedHash, currentHash })
            decayedCount++
            continue
          }
        }
        
        validLines.push(line)
      }

      if (decayedCount > 0) {
        log.info("memory decay applied", { trace_type: "memory_decay", totalLines: lines.length, decayedCount })
      }

      return validLines.join("\n")
    })

    return Service.of({ filterDecayed })
  })
)

export const defaultLayer = layer.pipe(
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(SemanticHash.defaultLayer)
)

export * as MemoryDecay from "./memory-decay"