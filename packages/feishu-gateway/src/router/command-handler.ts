import { SessionManager } from "../bridge/session-manager"
import { Logger } from "../logger"

const log = Logger.create("commands")

export class CommandHandler {
  async handle(senderId: string, chatId: string, cmd: string, sessions: SessionManager): Promise<string> {
    const parts = cmd.slice(1).split(/\s+/)
    const action = parts[0].toLowerCase()

    switch (action) {
      case "help":
        return [
          "**Helix × 飞书 命令帮助**",
          "",
          "• 直接发消息 → Helix Agent 执行任务（支持多轮对话）",
          "• `/new` → 开始新的对话（清除上下文）",
          "• `/status` → 查看当前任务状态",
          "• `/cancel` → 取消当前正在执行的任务",
        ].join("\n")

      case "new": {
        sessions.clearSession(chatId)
        return "✅ 已开始新对话。"
      }

      case "status": {
        if (sessions.isRunning(chatId)) return "⏳ 当前有任务正在执行中。"
        return "当前没有活跃任务。"
      }

      case "cancel": {
        if (!sessions.isRunning(chatId)) return "当前没有活跃任务。"
        sessions.cancel(chatId)
        return "✅ 任务已取消。"
      }

      default:
        return `未知命令: /${action}。输入 /help 查看可用命令。`
    }
  }
}
