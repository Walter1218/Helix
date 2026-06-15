import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"

const Parameters = z.object({
  reason: z.string().describe("The reason why this task must be suspended (e.g. waiting for external dependency, user input required, etc).")
})

export const SuspendTaskTool = Tool.define(
  "Suspend_Task",
  Effect.sync(() => ({
    description: "Use this tool to suspend your current task execution when you are blocked and cannot proceed further without external intervention or dependency resolution.",
    parameters: Parameters,
    execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) => Effect.gen(function* () {
      yield* ctx.metadata({
        metadata: {
          output: `Task suspended: ${params.reason}`,
          reason: params.reason
        }
      })
      
      return {
        title: "Suspend Task",
        metadata: {
          output: "Task suspended.",
        },
        output: "Your execution has been suspended."
      }
    })
  }))
)