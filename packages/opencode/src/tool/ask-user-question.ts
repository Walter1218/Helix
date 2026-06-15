import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"

const Parameters = z.object({
  question: z.string().describe("The specific question to ask the user. Be concise and actionable."),
  options: z
    .array(
      z.object({
        label: z.string().describe("Short display text for this option"),
        description: z.string().describe("What selecting this option means"),
      }),
    )
    .optional()
    .describe("Optional pre-defined choices. If provided, the user can select one instead of typing."),
  context: z.string().optional().describe("Why you need this information and how it affects the task."),
})

export const AskUserQuestionTool = Tool.define(
  "AskUserQuestion",
  Effect.sync(() => ({
    description:
      "Use this tool when you are stuck due to missing information that only the user can provide (e.g. which database to use, whether to optimize for speed or readability, which API key to use). This pauses execution and shows the user a question. Execution resumes when the user answers.",
    parameters: Parameters,
    execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const metadata = {
          output: `Question for user: ${params.question}`,
          question: params.question,
          options: params.options ?? [],
          context: params.context ?? "",
        }

        yield* ctx.metadata({ metadata })

        return {
          title: "Ask User Question",
          metadata,
          output: `Your execution has been paused. The user will see: "${params.question}"\n\nWhen the user responds, you will receive their answer and can continue from where you left off.`,
        }
      }),
  })),
)
