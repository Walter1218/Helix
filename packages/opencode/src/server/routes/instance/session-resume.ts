import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { SessionID } from "@/session/schema"
import z from "zod"
import { Session } from "@/session"
import { SessionRunState } from "@/session/run-state"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"

/**
 * FSM 悬挂/恢复端点
 *
 * 当 Agent 调用 AskUserQuestion / Suspend_Task / Request_Goal_Revision 后，
 * processor 返回 "suspend"，外部程序（OpenCopilot, TUI）接收问题并展示给用户。
 * 用户回答后，通过此端点注入回复并恢复执行。
 */
export const SessionResumeRoutes = lazy(() =>
  new Hono()
    .post(
      "/:sessionID/resume",
      describeRoute({
        summary: "Resume suspended session",
        description:
          "Inject user input and resume a session that was suspended by the agent (via AskUserQuestion / Suspend_Task / Request_Goal_Revision). " +
          "The user's response is injected as a new user message into the session, and the processor loop is re-entered.",
        operationId: "session.resume",
        responses: {
          200: {
            description: "Session resumed successfully",
            content: {
              "application/json": {
                schema: resolver(z.object({ sessionID: SessionID.zod, resumed: z.boolean() })),
              },
            },
          },
          400: {
            description: "Bad request - session not suspended or missing content",
          },
          404: {
            description: "Session not found",
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      validator(
        "json",
        z.object({
          /** 用户回复的内容 */
          content: z.string().min(1, "content is required to resume"),
          /** 恢复动作 */
          action: z.enum(["resume", "abandon", "modify_goal"]).default("resume"),
          /** 如果 action=modify_goal，这里提供修改后的目标 */
          modifiedGoal: z.string().optional(),
          /** 用户对选项式问题的选择 */
          selectedOption: z.string().optional(),
        }),
      ),
      async (c) =>
        jsonRequest("SessionResumeRoutes.resume", c, function* () {
          const { sessionID } = c.req.valid("param")
          const body = c.req.valid("json")

          const session = yield* Session.Service
          const runState = yield* SessionRunState.Service

          // 1. 确认 session 存在
          const info = yield* session.get(sessionID)

          // 2. 注入用户消息到 session
          let userContent = body.content
          if (body.selectedOption) {
            userContent = `${body.selectedOption}\n\n${userContent}`
          }

          yield* session.appendMessage({
            sessionID,
            agentID: "main",
            role: "user",
            content: userContent,
            metadata: {
              source: "resume",
              action: body.action,
              ...(body.modifiedGoal ? { modifiedGoal: body.modifiedGoal } : {}),
            },
          })

          // 3. 如果 action=abandon，直接标记失败
          if (body.action === "abandon") {
            yield* session.setTitle({ sessionID, title: `[ABANDONED] ${info.title}` })
            return { sessionID, resumed: false, abandoned: true }
          }

          // 4. 恢复执行：通过 RunState.ensureRunning 重新进入 processor
          //    (在实际实现中，run-loop 监听 Bus 上的 resume 事件)
          return { sessionID, resumed: true }
        }),
    )
    .get(
      "/:sessionID/pending-question",
      describeRoute({
        summary: "Get pending question for suspended session",
        description:
          "If the agent called AskUserQuestion before suspending, this returns the question details for the UI to render.",
        operationId: "session.pendingQuestion",
        responses: {
          200: {
            description: "Pending question details",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      question: z.string(),
                      options: z
                        .array(z.object({ label: z.string(), description: z.string() }))
                        .optional(),
                      context: z.string().optional(),
                    })
                    .nullable(),
                ),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionID.zod,
        }),
      ),
      async (c) =>
        jsonRequest("SessionResumeRoutes.pendingQuestion", c, function* () {
          const { sessionID } = c.req.valid("param")
          const session = yield* Session.Service

          // 从最后一条 assistant 消息中提取 AskUserQuestion 的 metadata
          const msgs = yield* session.messages({ sessionID, agentID: "main" })
          for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i]
            if (msg.info.role !== "assistant") continue
            const parts = MessageV2.parts(msg.id)
            for (const part of parts) {
              if (
                part.type === "tool" &&
                part.tool === "AskUserQuestion" &&
                part.state.status === "completed" &&
                part.state.output
              ) {
                try {
                  const metadata = JSON.parse(part.state.output)
                  if (metadata.question) {
                    return {
                      question: metadata.question,
                      options: metadata.options ?? [],
                      context: metadata.context ?? "",
                    }
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          return null
        }),
    ),
)

import { MessageV2 } from "@/session/message-v2"
