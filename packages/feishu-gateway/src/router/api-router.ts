import { Hono } from "hono"
import { SessionManager } from "../bridge/session-manager"
import { Logger } from "../logger"

const log = Logger.create("api")

interface AsyncTask {
  id: string
  chatId: string
  message: string
  status: "running" | "completed" | "failed"
  result?: string
  error?: string
  startedAt: number
  completedAt?: number
  lastActivity?: string
  stepCount?: number
}

export function createApiRouter(sessions: SessionManager) {
  const app = new Hono()

  const pendingTasks = new Map<string, { chatId: string; message: string; timestamp: number }>()
  const asyncTasks = new Map<string, AsyncTask>()

  // 异步任务提交 — 立即返回 taskId
  app.post("/task", async (c) => {
    try {
      const body = await c.req.json()
      const { chatId, message, mode } = body

      if (!chatId || !message) {
        return c.json({ error: "chatId and message are required" }, 400)
      }

      const taskId = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
      log.info("收到异步任务", { taskId, chatId, message: message.slice(0, 100), mode })

      // 通过飞书发送任务通知
      await sessions.sendText(chatId, `🤖 自动开发任务:\n${message}`)

      // 存储任务状态
      const task: AsyncTask = {
        id: taskId,
        chatId,
        message,
        status: "running",
        startedAt: Date.now(),
      }
      asyncTasks.set(taskId, task)

      // 后台执行（不阻塞 HTTP 响应）
      sessions.runTask(chatId, message, true, mode || "build").then(
        (result) => {
          task.status = "completed"
          task.result = result
          task.completedAt = Date.now()
          log.info("异步任务完成", { taskId, duration: task.completedAt - task.startedAt })
        },
        (err) => {
          task.status = "failed"
          task.error = err instanceof Error ? err.message : String(err)
          task.completedAt = Date.now()
          log.error("异步任务失败", { taskId, error: task.error })
        },
      )

      return c.json({ taskId, status: "running" })
    } catch (err: any) {
      log.error("API 任务提交失败", { error: err.message })
      return c.json({ error: err.message }, 500)
    }
  })

  // 查询异步任务状态（含心跳）
  app.get("/task/:taskId", async (c) => {
    const taskId = c.req.param("taskId")
    const task = asyncTasks.get(taskId)
    if (!task) {
      return c.json({ error: "Task not found" }, 404)
    }

    // 如果任务仍在运行，获取最新活动
    let liveActivity: string | undefined
    if (task.status === "running") {
      try {
        const sessionMap = (sessions as any).sessions as Map<string, string>
        const sessionID = sessionMap.get(task.chatId)
        if (sessionID) {
          const url = `${(sessions as any).sdk?.baseUrl || "http://localhost:3095"}/session/${sessionID}/message`
          const headers: Record<string, string> = {}
          const password = (sessions as any).sdk?.headers?.Authorization
          if (password) headers["Authorization"] = password
          const resp = await fetch(url, { headers, signal: AbortSignal.timeout(3000) })
          if (resp.ok) {
            const msgs = await resp.json() as any[]
            const assistantCount = msgs.filter((m: any) => m.info?.role === "assistant").length
            const lastAssistant = msgs.filter((m: any) => m.info?.role === "assistant").pop()
            const lastTools = (lastAssistant?.parts ?? [])
              .filter((p: any) => p.type === "tool")
              .map((p: any) => p.tool + "[" + (p.state?.status || "?") + "]")
              .join(", ")
            task.stepCount = assistantCount
            task.lastActivity = lastTools || "thinking"
          }
        }
      } catch {}
    }

    return c.json({
      taskId: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      duration: task.completedAt ? task.completedAt - task.startedAt : Date.now() - task.startedAt,
      stepCount: task.stepCount,
      lastActivity: task.lastActivity,
    })
  })

  // 清理已完成的任务（保留最近 50 个）
  app.get("/tasks", (c) => {
    const tasks = Array.from(asyncTasks.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50)
      .map(t => ({ taskId: t.id, status: t.status, startedAt: t.startedAt, completedAt: t.completedAt }))
    return c.json({ tasks })
  })

  // 健康检查
  app.get("/health", async (c) => {
    return c.json({ status: "ok", timestamp: Date.now() })
  })

  // 通用通知接口
  app.post("/notify", async (c) => {
    try {
      const body = await c.req.json()
      const { chatId, title, message, level } = body

      if (!chatId || !message) {
        return c.json({ error: "chatId and message are required" }, 400)
      }

      const icon = level === "error" ? "❌" : level === "warn" ? "⚠️" : "ℹ️"
      const titleLine = title ? `${icon} **${title}**\n\n` : `${icon} `
      await sessions.sendText(chatId, `${titleLine}${message}`)

      log.info("通知已发送", { chatId, title, level })
      return c.json({ success: true })
    } catch (err: any) {
      log.error("发送通知失败", { error: err.message })
      return c.json({ error: err.message }, 500)
    }
  })

  // 发送权限问题通知到飞书
  app.post("/notify-permission-issue", async (c) => {
    try {
      const body = await c.req.json()
      const { chatId, taskId, taskTitle, errorMessage, permissionRequest } = body

      if (!chatId) {
        return c.json({ error: "chatId is required" }, 400)
      }

      log.info("发送权限问题通知", { chatId, taskId, taskTitle })

      const callID = `permission_${Date.now()}`
      sessions.addPendingPermission(chatId, {
        callID,
        chatId,
        questionText: permissionRequest || '访问外部目录文件',
        originalMessage: `请读取 /etc/hosts 文件，检查本地 DNS 配置`,
        timestamp: Date.now()
      })

      pendingTasks.set(chatId, {
        chatId,
        message: `请读取 /etc/hosts 文件，检查本地 DNS 配置`,
        timestamp: Date.now()
      })

      const notifyMessage = `⚠️ **自动开发任务遇到权限问题**\n\n` +
        `**任务**: ${taskTitle || taskId || '未知任务'}\n` +
        `**错误**: ${errorMessage || '权限不足'}\n\n` +
        `**需要权限**: ${permissionRequest || '访问外部目录文件'}\n\n` +
        `请回复以下内容来授权:\n` +
        `- "允许"\n` +
        `- "拒绝"`

      await sessions.sendText(chatId, notifyMessage)

      return c.json({ success: true })
    } catch (err: any) {
      log.error("发送权限问题通知失败", { error: err.message })
      return c.json({ error: err.message }, 500)
    }
  })

  // 查询权限请求状态
  app.get("/permission/:chatId", (c) => {
    const chatId = c.req.param("chatId")
    const pending = sessions.getPendingPermission(chatId)
    return c.json({ pending: !!pending, permission: pending })
  })

  // 回复权限请求
  app.post("/permission/:chatId/reply", async (c) => {
    const chatId = c.req.param("chatId")
    const body = await c.req.json()
    const { approved } = body

    const pending = sessions.getPendingPermission(chatId)
    if (!pending) {
      return c.json({ error: "No pending permission" }, 404)
    }

    const success = await sessions.replyPermission(pending.callID, approved)
    if (success) {
      sessions.clearPendingPermission(chatId)

      if (approved) {
        const pendingTask = pendingTasks.get(chatId)
        if (pendingTask) {
          log.info("权限已批准，继续执行任务", { chatId })
          const result = await sessions.runTask(chatId, pendingTask.message)
          pendingTasks.delete(chatId)
          return c.json({ success: true, continued: true, result })
        }
      }
    }

    return c.json({ success, continued: false })
  })

  // 飞书卡片交互回调
  app.post("/card/action", async (c) => {
    try {
      const body = await c.req.json()

      if (body.challenge) {
        return c.json({ challenge: body.challenge })
      }

      const action = body.action?.value
      if (!action) {
        return c.json({ ok: true })
      }

      const { action: actionType, sessionID } = action

      if (actionType === "suspend" && sessionID) {
        log.info("用户点击暂停任务", { sessionID })
        const sessionMap = (sessions as any).sessions as Map<string, string>
        const chatId = Array.from(sessionMap.entries())
          .find(([_, sid]: [string, any]) => sid === sessionID)?.[0]
        if (chatId) {
          sessions.cancel(chatId)
          await sessions.sendText(chatId, "⏸ 任务已暂停。发送新消息可重新开始。")
        }
      }

      if (actionType === "ignore") {
        log.info("用户忽略偏离告警", { sessionID })
      }

      return c.json({ ok: true })
    } catch (err: any) {
      log.error("卡片交互回调处理失败", { error: err.message })
      return c.json({ ok: true })
    }
  })

  return app
}
