import { expect, test, describe } from "bun:test"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { AstGraph } from "@/ast/graph"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { InstanceRef } from "@/effect/instance-ref"
import { Instance } from "@/project/instance"
import * as path from "path"
import * as os from "os"
import * as fsNode from "fs/promises"

describe("AstGraph", () => {
  test("generates blast radius and contract for TS files", async () => {
    const dir = path.join(os.tmpdir(), "ast-graph-test-" + Date.now())
    await fsNode.mkdir(dir, { recursive: true })

    const mockContext = {
      directory: dir,
      worktree: dir,
      project: { id: "test-proj", vcs: "git" }
    } as any

    await Instance.provide({
      directory: dir,
      fn: async () => {
        await AppRuntime.runPromise(
          Effect.gen(function* () {
            const fs = yield* AppFileSystem.Service
            const ast = yield* AstGraph.Service

            // Create a math module
            const mathContent = `
export function add(a: number, b: number): number {
  return a + b;
}

export class Calculator {
  value: number = 0;
  add(v: number) { this.value += v; }
}

export interface Operations {
  doMath(): void;
}
`
            yield* fs.writeWithDirs(path.join(dir, "math.ts"), mathContent)

            // Create a dependent module
            const appContent = `
import { add, Calculator } from "./math";

export function run() {
  const calc = new Calculator();
  calc.add(add(1, 2));
}
`
            yield* fs.writeWithDirs(path.join(dir, "app.ts"), appContent)
            
            // Dummy tsconfig to satisfy project constraint
            yield* fs.writeWithDirs(path.join(dir, "tsconfig.json"), "{}")

            // Test Contract Extraction
            const contract = yield* ast.getContract(path.join(dir, "math.ts"))
            
            expect(contract).toContain("export class Calculator")
            expect(contract).toContain("value: number")
            expect(contract).toContain("add(v: number)")
            expect(contract).toContain("export function add(a: number, b: number): number")
            expect(contract).toContain("export interface Operations")
            
            // The implementation details should be stripped
            expect(contract).not.toContain("return a + b")

            // Test Blast Radius Extraction
            const radius = yield* ast.getBlastRadius(path.join(dir, "math.ts"))
            
            expect(radius.length).toBeGreaterThan(0)
            // Should detect that app.ts depends on math.ts
            expect(radius.some(p => p.endsWith("app.ts"))).toBe(true)

          }).pipe(
            Effect.provideService(InstanceRef, mockContext),
            Effect.provide(AstGraph.defaultLayer),
            Effect.provide(AppFileSystem.defaultLayer)
          )
        )
      }
    })
    
    await fsNode.rm(dir, { recursive: true, force: true })
  })
})