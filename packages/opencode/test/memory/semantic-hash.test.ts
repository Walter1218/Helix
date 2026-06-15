import { expect, test, describe } from "bun:test"
import { Effect } from "effect"
import { SemanticHash } from "@/memory/semantic-hash"
import { AppRuntime } from "@/effect/app-runtime"

describe("SemanticHash", () => {
  test("hashes content while ignoring whitespace and comments", async () => {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const svc = yield* SemanticHash.Service

        const content1 = `
          function hello() {
            // this is a comment
            console.log("world");
          }
        `

        const content2 = `
          function hello() { console.log("world"); } /* multi
          line 
          comment */
        `

        const hash1 = yield* svc.hashContent(content1)
        const hash2 = yield* svc.hashContent(content2)

        expect(hash1).toEqual(hash2)
        expect(hash1.length).toBe(12)
      }).pipe(Effect.provide(SemanticHash.defaultLayer))
    )
  })

  test("python comments are ignored", async () => {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const svc = yield* SemanticHash.Service

        const content1 = `
          def hello():
              # this is a comment
              print("world")
        `

        const content2 = `def hello(): print("world")`

        const hash1 = yield* svc.hashContent(content1)
        const hash2 = yield* svc.hashContent(content2)

        expect(hash1).toEqual(hash2)
      }).pipe(Effect.provide(SemanticHash.defaultLayer))
    )
  })
})
