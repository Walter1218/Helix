import type { FeishuEvent } from "../client/feishu-ws"
import { SessionManager } from "../bridge/session-manager"
import { EventBridge } from "../bridge/event-bridge"
import { CardBuilder } from "../cards/card-builder"
import { CommandHandler } from "./command-handler"
import { config } from "../config"
import { Logger } from "../logger"

const log = Logger.create("router")

/**
 * 消息路由器：解析飞书事件，按类型分发处理。
 */
export class MessageRouter {
  private commands: CommandHandler
  private sessions: SessionManager
  private bridge: EventBridge
  private cards: CardBuilder

  constructor() {
    this.commands = new CommandHandler()
    this.sessions = new SessionManager()
    this.bridge = new EventBridge()
    this.cards = new CardBuilder()
  }

  onMessage: (event: FeishuEvent, raw: string) => Promise<void> = async (event) => {
    try {
      const msg = event.event?.message
      if (!msg || !event.event?.sender) return

      // 只处理文本消息
      if (msg.message_type !== "text") return

      const senderId = event.event.sender.sender_id?.open_id ?? ""
      const chatId = msg.chat_id ?? ""
      const chatType = msg.chat_type ?? "p2p"
      const content = this.decodeMessageContent(msg.content ?? "")

      log.info(`收到消息`, { senderId, chatId, chatType, content: content.slice(0, 80) })

      // 用户白名单
      if (!this.isAllowed(senderId)) return

      // 群聊响应控制
      if (chatType === "group" && config.feishu.groupMode === "off") return
      if (chatType === "group" && config.feishu.groupMode === "mention") {
        if (!content.includes("@")) return
      }

      const text = this.stripMention(content)

      // 内置命令
      if (text.startsWith("/")) {
        await this.handleCommand(senderId, chatId, text)
        return
      }

      // 正常任务 → Helix
      await this.dispatchTask(senderId, chatId, text)
    } catch (err) {
      log.error("消息处理异常", err)
    }
  }

  // ---- private ----

  private isAllowed(senderId: string): boolean {
    const allowed = config.feishu.allowedUsers
    if (allowed.length === 0) return true
    const ok = allowed.includes(senderId)
    if (!ok) log.warn(`用户 ${senderId} 不在白名单中，忽略`)
    return ok
  }

  private decodeMessageContent(raw: string): string {
    try {
      const obj = JSON.parse(raw)
      return obj.text ?? raw
    } catch {
      return raw
    }
  }

  private stripMention(text: string): string {
    return text.replace(/@\S+/g, "").trim()
  }

  private async handleCommand(senderId: string, chatId: string, cmd: string) {
    const result = await this.commands.handle(senderId, chatId, cmd, this.sessions)
    await this.sendText(chatId, result)
  }

  private async dispatchTask(senderId: string, chatId: string, text: string) {
    await this.sendText(chatId, `🚀 Helix Agent 已接管任务:\n> ${text.slice(0, 200)}`)

    const sessionID = await this.sessions.create(senderId, chatId)
    if (!sessionID) {
      await this.sendText(chatId, "❌ 无法连接 Helix 引擎，请检查 Helix 服务是否启动。")
      return
    }

    // 下发任务 Goal
    await this.sessions.sendPrompt(sessionID, text)

    // 订阅 Helix 事件，反向推飞书
    this.bridge.subscribe(sessionID, chatId, (msg) => this.sendText(chatId, msg), (card) => this.sendCard(chatId, card))

    // 5 分钟后自动清理 session
    setTimeout(() => this.bridge.unsubscribe(sessionID), 300_000)
  }

  // ---- 飞书消息发送 ----

  private async sendText(chatId: string, text: string) {
    try {
      await this.callBotApi("im/v1/messages", {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      })
    } catch (err) {
      log.error("发送消息失败", err)
    }
  }

  private async sendCard(chatId: string, card: unknown) {
    try {
      await this.callBotApi("im/v1/messages", {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(card),
      })
    } catch (err) {
      log.error("发送卡片失败", err)
    }
  }

  private async callBotApi(path: string, body: Record<string, unknown>) {
    const token = await this.sessions.getAccessToken()
    const baseHost = config.feishu.domain === "lark" ? "https://open.larksuite.com/open-apis" : "https://open.feishu.cn/open-apis"
    const res = await fetch(`${baseHost}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return res.json()
  }
}
