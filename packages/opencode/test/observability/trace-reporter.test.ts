import { expect, test, describe } from "bun:test"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { TraceReporter } from "@/observability/trace-reporter"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { Instance } from "@/project/instance"

describe("TraceReporter", () => {
  test("emits and stores traces correctly", async () => {
    const mockContext = {
      directory: "/tmp/mock-project",
      worktree: "/tmp/mock-project",
      project: { id: "test-proj", vcs: "git" }
    } as any

    await Instance.provide({
      directory: mockContext.directory,
      fn: async () => {
        await AppRuntime.runPromise(
          Effect.gen(function* () {
            const reporter = yield* TraceReporter.Service
            
            yield* reporter.emitTrace({
              id: "test-node-1",
              type: "action",
              name: "Plan Task",
              status: "success",
              metadata: { foo: "bar" }
            })

            yield* reporter.emitTrace({
              id: "test-node-2",
              parentId: "test-node-1",
              type: "decision",
              name: "Judge Evaluation",
              status: "pending"
            })

            yield* Effect.promise(() => Bun.sleep(10)) // Wait for bus events to be processed

            const traces = yield* reporter.getTraces()
            expect(traces.length).toBe(2)
            expect(traces[0].id).toBe("test-node-1")
            expect(traces[0].name).toBe("Plan Task")
            expect(traces[0].timestamp).toBeGreaterThan(0)
            expect(traces[0].metadata).toEqual({ foo: "bar" })

            expect(traces[1].parentId).toBe("test-node-1")
            expect(traces[1].status).toBe("pending")
          }).pipe(
            Effect.provideService(InstanceRef, mockContext),
            Effect.provideService(WorkspaceRef, "test-workspace-id" as any),
            Effect.provide(TraceReporter.defaultLayer)
          )
        )
      }
    })
  })
})
