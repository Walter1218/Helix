import { Hono } from "hono"
import { SessionManager } from "../bridge/session-manager"
import { Logger } from "../logger"

const log = Logger.create("api")

export function createApiRouter(sessions: SessionManager) {
  const app = new Hono()

  // 发送任务到飞书（供自动开发任务调用）
  app.post("/task", async (c) => {
    try {
      const body = await c.req.json()
      const { chatId, message } = body

      if (!chatId || !message) {
        return c.json({ error: "chatId and message are required" }, 400)
      }

      log.info("收到 API 任务请求", { chatId, message: message.slice(0, 100) })

      // 通过飞书发送任务通知
      await sessions.sendText(chatId, `🤖 自动开发任务:\n${message}`)

      // 执行任务
      const result = await sessions.runTask(chatId, message)

      return c.json({ success: true, result })
    } catch (err: any) {
      log.error("API 任务执行失败", { error: err.message })
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

      // 创建一个待处理的权限请求
      const callID = `permission_${Date.now()}`
      sessions.addPendingPermission(chatId, {
        callID,
        chatId,
        questionText: permissionRequest || '访问外部目录文件',
        timestamp: Date.now()
      })

      // 发送权限问题通知，包含具体的权限请求
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
  app.get("/permission/:chatId", async (c) => {
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
    }

    return c.json({ success })
  })

  return app
}
