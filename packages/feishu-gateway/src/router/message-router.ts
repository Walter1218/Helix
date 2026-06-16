import type { MessageEventData } from "../client/feishu-ws"
import { SessionManager } from "../bridge/session-manager"
import { CardBuilder } from "../cards/card-builder"
import { CommandHandler } from "./command-handler"
import { config } from "../config"
import { Logger } from "../logger"

const log = Logger.create("router")

/**
 * 消息路由器：解析飞书 SDK 事件数据，按类型分发处理。
 * Server 模式：通过 Helix HTTP API 执行任务，支持多轮对话上下文。
 */
export class MessageRouter {
  private commands: CommandHandler
  private sessions: SessionManager
  private cards: CardBuilder
  private processedMessages = new Set<string>()
  private readonly MESSAGE_ID_TTL = 60_000 // 1 分钟过期

  constructor() {
    this.commands = new CommandHandler()
    this.sessions = new SessionManager()
    this.cards = new CardBuilder()
  }

  /** SDK EventDispatcher 回调入口 */
  onMessage = async (data: MessageEventData) => {
    try {
      const msg = data.message
      const sender = data.sender
      if (!msg || !sender) return

      // 消息去重（飞书可能会重复推送同一条消息）
      const messageId = msg.message_id
      if (this.processedMessages.has(messageId)) {
        log.info("跳过重复消息", { messageId })
        return
      }
      this.processedMessages.add(messageId)
      setTimeout(() => this.processedMessages.delete(messageId), this.MESSAGE_ID_TTL)

      // 只处理文本消息
      if (msg.message_type !== "text") return

      const senderId = sender.sender_id?.open_id ?? ""
      const chatId = msg.chat_id
      const chatType = msg.chat_type
      const content = this.decodeMessageContent(msg.content)

      log.info("收到消息", { senderId, chatId, chatType, content: content.slice(0, 80) })

      // 用户白名单
      if (!this.isAllowed(senderId)) return

      // 群聊响应控制
      if (chatType === "group" && config.feishu.groupMode === "off") return
      if (chatType === "group" && config.feishu.groupMode === "mention") {
        if (!msg.mentions?.length) return
      }

      const text = this.stripMention(content)

      // 内置命令
      if (text.startsWith("/")) {
        await this.handleCommand(senderId, chatId, text)
        return
      }

      // 正常任务 → Helix (Server 模式)
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
    await this.sessions.sendText(chatId, result)
  }

  private async dispatchTask(senderId: string, chatId: string, text: string) {
    if (this.sessions.isRunning(chatId)) {
      await this.sessions.sendText(chatId, "⏳ 上一个任务还在执行中，发送 /cancel 取消后再试。")
      return
    }

    log.info("开始执行任务", { chatId, text: text.slice(0, 80) })
    await this.sessions.sendText(chatId, `🚀 Helix Agent 已接管任务:\n> ${text.slice(0, 200)}`)

    const result = await this.sessions.runTask(chatId, text)
    log.info("任务执行完成", { chatId, resultLength: result.length, resultPreview: result.slice(0, 100) })

    // 飞书单条消息有长度限制，截断超长输出
    const trimmed = result.length > 4000 ? result.slice(0, 4000) + "\n\n... (输出过长已截断)" : result
    await this.sessions.sendText(chatId, trimmed)
    log.info("回复已发送", { chatId })
  }
}
