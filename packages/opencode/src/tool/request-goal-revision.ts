import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"

const Parameters = z.object({
  reason: z.string().describe("The detailed reasoning for why the current goal needs to be revised or the test is invalid."),
  proposed_revision: z.string().describe("The suggested new goal or test expectation.")
})

export const RequestGoalRevisionTool = Tool.define(
  "Request_Goal_Revision",
  Effect.sync(() => ({
    description: "Use this tool to suspend your current execution and ask the Judge Agent to review and potentially revise the macro goal or test assertions, if you believe the goal is impossible, contradictory, or the tests themselves are flawed.",
    parameters: Parameters,
    execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) => Effect.gen(function* () {
      yield* ctx.metadata({
        metadata: {
          output: "Execution suspended. Requesting goal revision from Judge Agent...",
          reason: params.reason,
          proposed_revision: params.proposed_revision
        }
      })
      
      return {
        title: "Request Goal Revision",
        metadata: {
          output: "Goal revision requested.",
        },
        output: "Your execution has been suspended. The Judge Agent is reviewing your request."
      }
    })
  }))
)