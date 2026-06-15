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
          "• 直接发消息 → 下发宏观任务给 Helix",
          "• `/status` → 查看当前任务状态",
          "• `/cancel` → 取消当前任务",
          "• 当 Agent 需要你决策时，会推送选项卡片",
        ].join("\n")

      case "status": {
        const sessionID = sessions.getSessionID(senderId)
        if (!sessionID) return "当前没有活跃任务。"
        const info = await sessions.getSessionInfo(sessionID)
        return `当前任务: ${sessionID}\n状态: ${info?.status ?? "未知"}`
      }

      case "cancel": {
        const sid = sessions.getSessionID(senderId)
        if (!sid) return "当前没有活跃任务。"
        await sessions.cancel(sid)
        sessions.clear(senderId)
        return "✅ 任务已取消。"
      }

      default:
        return `未知命令: /${action}。输入 /help 查看可用命令。`
    }
  }
}
