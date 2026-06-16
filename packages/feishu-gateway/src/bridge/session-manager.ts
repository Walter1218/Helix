import * as lark from "@larksuiteoapi/node-sdk"
import { createOpencodeClient, type OpencodeClient } from "@mimo-ai/sdk/v2"
import { config } from "../config"
import { Logger } from "../logger"

const log = Logger.create("session")

/**
 * Session 管理器：通过 Helix HTTP Server API 执行任务。
 * 每个 chat_id 对应一个 Helix session，支持多轮对话上下文。
 */
export class SessionManager {
  private sessions = new Map<string, string>() // chatId -> helix sessionID
  private runningTasks = new Map<string, AbortController>() // chatId -> abort controller
  public readonly larkClient: lark.Client
  private sdk: OpencodeClient

  constructor() {
    this.larkClient = new lark.Client({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
      domain: config.feishu.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
    })

    // 创建 Helix SDK 客户端
    const headers: Record<string, string> = {}
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

    this.sdk = createOpencodeClient({
      baseUrl: config.helix.url,
      directory: config.helix.workDir,
      headers,
    })

    log.info("Helix SDK 客户端已初始化", { url: config.helix.url })
  }

  /** 获取或创建 chat_id 对应的 session */
  async getOrCreateSession(chatId: string): Promise<string> {
    const existing = this.sessions.get(chatId)
    if (existing) {
      // 验证 session 是否仍然有效
      try {
        const result = await this.sdk.session.get({ sessionID: existing })
        if (result.data) return existing
      } catch {
        this.sessions.delete(chatId)
      }
    }

    // 创建新 session
    try {
      log.info("正在创建 session...")
      const result = await this.sdk.session.create({
        title: `飞书会话 ${chatId}`,
      })
      log.info("session.create 返回", { data: result.data, error: result.error })
      if (result.data?.id) {
        this.sessions.set(chatId, result.data.id)
        log.info("创建新 session", { chatId, sessionID: result.data.id })
        return result.data.id
      }
      log.error("session.create 返回但没有 id", { result })
    } catch (err: any) {
      log.error("创建 session 异常", { message: err.message, stack: err.stack, response: err.response })
    }

    throw new Error("无法创建 Helix session")
  }

  /** 通过 Helix HTTP API 执行任务，返回输出结果 */
  async runTask(chatId: string, text: string): Promise<string> {
    // 取消该 chat 之前未完成的任务
    this.cancel(chatId)

    const controller = new AbortController()
    this.runningTasks.set(chatId, controller)

    try {
      const sessionID = await this.getOrCreateSession(chatId)

      log.info("发送消息到 Helix", { chatId, sessionID, text: text.slice(0, 80) })

      // 使用 promptAsync 发送消息（非阻塞）
      await this.sdk.session.promptAsync({
        sessionID,
        parts: [{ type: "text", text }],
      })

      // 等待 AI 完成回复
      const response = await this.waitForCompletion(sessionID, controller.signal)

      return response
    } catch (err: any) {
      if (err.name === "AbortError") {
        return "⏹️ 任务已取消"
      }
      log.error("Helix 任务执行失败", { message: err.message, name: err.name, stack: err.stack?.slice(0, 200), response: err.response?.data })
      return `❌ Agent 执行失败: ${err.message}`
    } finally {
      this.runningTasks.delete(chatId)
    }
  }

  /** 自适应超时配置 */
  private static readonly TIMEOUT_CONFIG = {
    baseTimeout: 3 * 60 * 1000,      // 基础超时 3 分钟
    extensionTime: 3 * 60 * 1000,    // 每次延长 3 分钟
    maxExtensions: 3,                 // 最大延长 3 次
    maxTotalTime: 15 * 60 * 1000,    // 总超时上限 15 分钟
    pollInterval: 3000,               // 轮询间隔 3 秒
    maxSteps: 20,                     // 最大步骤数
  }

  /** 偏离状态检测：评估任务是否在正常推进 */
  private evaluateDeviation(messages: any[]): { shouldExtend: boolean; reason: string } {
    const assistantMessages = messages.filter((m: any) => m.info?.role === "assistant")
    const lastAssistant = assistantMessages[assistantMessages.length - 1]

    if (!lastAssistant) {
      return { shouldExtend: false, reason: "无 assistant 消息" }
    }

    // 检查步骤数是否过多
    const stepCount = assistantMessages.length
    if (stepCount >= SessionManager.TIMEOUT_CONFIG.maxSteps) {
      return { shouldExtend: false, reason: `步骤数过多 (${stepCount})` }
    }

    // 检查最近的 tool 调用
    const recentParts = lastAssistant.parts ?? []
    const toolCalls = recentParts.filter((p: any) => p.type === "tool")
    const hasNewToolCalls = toolCalls.length > 0

    // 检查是否有错误
    const hasErrors = toolCalls.some((p: any) => p.state?.status === "error")

    // 检查是否有输出变化（通过检查 tool 输出是否为空）
    const hasOutput = toolCalls.some((p: any) => {
      const output = p.state?.output
      return output && output.length > 0
    })

    // 决策逻辑
    if (hasErrors) {
      return { shouldExtend: false, reason: "存在错误" }
    }

    if (!hasNewToolCalls) {
      return { shouldExtend: false, reason: "无新的工具调用" }
    }

    if (!hasOutput) {
      return { shouldExtend: false, reason: "工具调用无输出" }
    }

    return { shouldExtend: true, reason: `正常推进 (步骤 ${stepCount}, 有新输出)` }
  }

  /** 等待 session 完成回复（自适应超时） */
  private async waitForCompletion(sessionID: string, signal: AbortSignal): Promise<string> {
    const { baseTimeout, extensionTime, maxExtensions, maxTotalTime, pollInterval } = SessionManager.TIMEOUT_CONFIG
    const startTime = Date.now()
    let currentDeadline = startTime + baseTimeout
    let extensionCount = 0
    let lastDeviationCheck = 0

    // 构建认证头
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

    while (Date.now() < currentDeadline) {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }

      try {
        // 直接调用 API 获取 messages（SDK 会丢失 time.completed 字段）
        const url = `${config.helix.url}/session/${sessionID}/message`
        const resp = await fetch(url, { headers })
        const messages: any[] = await resp.json()

        log.info("轮询消息", { sessionID, messageCount: messages.length })

        // 找到最后一个 assistant 消息
        const assistantMessages = messages.filter((m: any) => m.info?.role === "assistant")

        // 检查最后一个 assistant 消息是否完成
        if (assistantMessages.length > 0) {
          const lastAssistant = assistantMessages[assistantMessages.length - 1]
          const completed = lastAssistant.info?.time?.completed

          if (completed) {
            log.info("任务完成", { completed, elapsed: Date.now() - startTime })
            const textParts = (lastAssistant.parts ?? [])
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n")

            return textParts || "✅ 任务已完成（无文本输出）"
          }
        }

        // 接近超时时进行偏离检测
        const timeToDeadline = currentDeadline - Date.now()
        if (timeToDeadline < 30000 && Date.now() - lastDeviationCheck > 60000) {
          lastDeviationCheck = Date.now()
          const { shouldExtend, reason } = this.evaluateDeviation(messages)
          const totalElapsed = Date.now() - startTime

          log.info("偏离状态评估", { shouldExtend, reason, extensionCount, totalElapsed })

          if (shouldExtend && extensionCount < maxExtensions && totalElapsed + extensionTime <= maxTotalTime) {
            extensionCount++
            currentDeadline += extensionTime
            log.info("延长超时", { extensionCount, newDeadline: currentDeadline, reason })
          } else if (!shouldExtend) {
            log.info("任务偏离，准备终止", { reason })
            throw new Error(`任务执行超时: ${reason}`)
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") throw err
        if (err.message?.startsWith("任务执行超时")) throw err
        log.warn("轮询消息失败", { error: err.message })
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new Error(`任务执行超时（已延长 ${extensionCount} 次，总耗时 ${Math.round((Date.now() - startTime) / 1000)}s）`)
  }

  /** 取消正在执行的任务 */
  cancel(chatId: string): boolean {
    const controller = this.runningTasks.get(chatId)
    if (controller) {
      controller.abort()
      this.runningTasks.delete(chatId)
      return true
    }
    return false
  }

  isRunning(chatId: string): boolean {
    return this.runningTasks.has(chatId)
  }

  /** 清除 chat 的 session（用于 /new 命令） */
  clearSession(chatId: string) {
    this.sessions.delete(chatId)
  }

  /** 发送文本消息（使用 SDK Client，自动处理 token） */
  async sendText(chatId: string, text: string) {
    try {
      await this.larkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        },
      })
    } catch (err) {
      log.error("发送消息失败", err)
    }
  }

  /** 发送交互式卡片（使用 SDK Client） */
  async sendCard(chatId: string, card: unknown) {
    try {
      await this.larkClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "interactive",
          content: JSON.stringify(card),
        },
      })
    } catch (err) {
      log.error("发送卡片失败", err)
    }
  }
}
