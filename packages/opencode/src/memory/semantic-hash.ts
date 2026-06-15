import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import * as crypto from "crypto"

export interface Interface {
  /**
   * Generates a stable semantic hash for the given file content.
   * Strips single-line and multi-line comments, collapses whitespace,
   * so that formatting changes don't alter the hash.
   */
  readonly hashContent: (content: string) => Effect.Effect<string>
  readonly hashFile: (filepath: string) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SemanticHash") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const hashContent = Effect.fn("SemanticHash.hashContent")(function* (content: string) {
      // Basic heuristic: remove comments and normalize whitespace
      const stripped = content
        // Remove multi-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Remove single-line comments (js/ts, rust, c, etc.)
        .replace(/\/\/.*/g, "")
        // Remove python/shell comments (only if at start or after whitespace)
        .replace(/(^|\s)#.*/g, "")
        // Collapse whitespace
        .replace(/\s+/g, " ")
        .trim()
        
      return crypto.createHash("sha256").update(stripped).digest("hex").slice(0, 12)
    })

    const hashFile = Effect.fn("SemanticHash.hashFile")(function* (filepath: string) {
      const content = yield* fs.readFileString(filepath).pipe(Effect.catch(() => Effect.succeed("")))
      return yield* hashContent(content)
    })

    return Service.of({ hashContent, hashFile })
  })
)

export const defaultLayer = layer.pipe(Layer.provide(AppFileSystem.defaultLayer))

export * as SemanticHash from "./semantic-hash"