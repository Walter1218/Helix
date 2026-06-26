import * as lark from "@larksuiteoapi/node-sdk"
import { createOpencodeClient, type OpencodeClient } from "@mimo-ai/sdk/v2"
import { config } from "../config"
import { Logger } from "../logger"
import { EventBridge } from "./event-bridge"
import { AlignmentNotifier } from "./alignment-notifier"

const log = Logger.create("session")

/**
 * Session 管理器：通过 Helix HTTP Server API 执行任务。
 * 每个 chat_id 对应一个 Helix session，支持多轮对话上下文。
 */
export class SessionManager {
  private sessions = new Map<string, string>() // chatId -> helix sessionID
  private runningTasks = new Map<string, AbortController>() // chatId -> abort controller
  private pendingPermissions = new Map<string, any>() // requestId -> permission data
  public readonly larkClient: lark.Client
  private sdk: OpencodeClient
  private eventBridge: EventBridge
  private alignmentNotifier: AlignmentNotifier

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

    // 初始化全局偏离告警通知器
    this.alignmentNotifier = new AlignmentNotifier(
      (chatId, card) => this.sendCard(chatId, card),
    )
    this.alignmentNotifier.start()

    // 初始化事件桥接器
    this.eventBridge = new EventBridge()

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

  /** 总是创建新 session（不复用） */
  private async createSession(chatId: string): Promise<string> {
    log.info("创建新 session（自动开发模式）", { chatId })
    const result = await this.sdk.session.create({
      title: `Auto-Dev ${chatId} ${new Date().toISOString().slice(0, 19)}`,
    })
    if (result.data?.id) {
      this.sessions.set(chatId, result.data.id)
      log.info("新 session 已创建", { sessionID: result.data.id })
      return result.data.id
    }
    throw new Error("无法创建 Helix session")
  }

  /** 通过 Helix HTTP API 执行任务，返回输出结果 */
  async runTask(chatId: string, text: string, autoApprove = false, mode = "ask"): Promise<string> {
    // 取消该 chat 之前未完成的任务
    this.cancel(chatId)

    const controller = new AbortController()
    this.runningTasks.set(chatId, controller)

    try {
      // 自动开发模式每次创建新 session，避免状态污染
      const sessionID = autoApprove
        ? await this.createSession(chatId)
        : await this.getOrCreateSession(chatId)

      log.info("发送消息到 Helix", { chatId, sessionID, text: text.slice(0, 80) })

      // 注册到全局偏离告警通知器
      this.alignmentNotifier.registerChat(sessionID, chatId)

      // 订阅事件流，监听权限请求和实时更新
      this.eventBridge.subscribe(
        sessionID,
        chatId,
        // onMessage: 普通消息回调
        (msg) => {
          log.info("收到事件消息", { msg })
        },
        // onCard: 卡片回调（权限请求 + 偏离告警 + 流式更新 + 错误）
        async (cardData: any) => {
          // 流式更新卡片
          if (cardData?.type === "streaming_update") {
            log.info("收到流式更新，发送卡片到飞书", { sessionID })
            await this.sendCard(chatId, cardData.card)
            return
          }

          // 执行树卡片
          if (cardData?.type === "execution_tree") {
            log.info("收到执行树，发送卡片到飞书", { stepCount: cardData.card?.elements?.length })
            await this.sendCard(chatId, cardData.card)
            return
          }

          // 偏离告警卡片
          if (cardData?.type === "alignment_alert") {
            log.info("收到偏离告警，发送卡片到飞书")
            await this.sendCard(chatId, cardData.card)
            return
          }

          // 会话错误卡片
          if (cardData?.type === "session_error") {
            log.error("收到会话错误，发送卡片到飞书")
            await this.sendCard(chatId, cardData.card)
            return
          }

          // 工作流结果卡片
          if (cardData?.type === "workflow_result") {
            log.info("收到工作流结果，发送卡片到飞书")
            await this.sendCard(chatId, cardData.card)
            return
          }

          // 追问请求
          if (cardData?.type === "question") {
            log.info("收到追问请求，转发到飞书", { questionData: cardData })
            const questionText = cardData.question || "Agent 需要你的输入"
            const options = cardData.options || []
            
            let msg = `❓ **Agent 追问**\n\n${questionText}`
            if (options.length > 0) {
              msg += `\n\n请回复选项编号或内容:\n${options.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}`
            }
            
            await this.sendText(chatId, msg)
            
            const requestId = cardData.id
            if (requestId) {
              this.pendingPermissions.set(requestId, {
                sessionID,
                chatId,
                callID: requestId,
                questionText,
                timestamp: Date.now()
              })
            }
            return
          }

          // 权限请求回调
          log.info("收到权限请求，转发到飞书", { permissionData: cardData })
          
          const permission = cardData?.permission || "unknown"
          const patterns = cardData?.patterns || []
          const metadata = cardData?.metadata || {}
          
          const cardMessage = `🔐 **权限请求**\n\n` +
            `**权限类型**: ${permission}\n` +
            `**请求路径**: ${metadata.filepath || patterns.join(", ") || "未知"}\n` +
            `**操作**: Agent 需要访问项目外部的文件\n\n` +
            `请回复:\n` +
            `- \`允许\` 或 \`yes\` - 批准本次操作\n` +
            `- \`拒绝\` 或 \`no\` - 拒绝本次操作`
          
          await this.sendText(chatId, cardMessage)
          
          const requestId = cardData?.id
          if (requestId) {
            this.pendingPermissions.set(requestId, {
              sessionID,
              chatId,
              permissionData: cardData,
              timestamp: Date.now()
            })
          }
        }
      )

      // 先记录当前消息数量，用于区分新旧消息
      const baselineCount = await this.getMessageCount(sessionID)

      // 使用 promptAsync 发送消息（非阻塞）
      // autoApprove 模式：禁用 actor（subagent 在 Gateway 下不可靠），只用基础工具
      await this.sdk.session.promptAsync({
        sessionID,
        parts: [{ type: "text", text }],
        agent: mode,
        ...(autoApprove ? { tools: {
          "actor": false,
          "read": true,
          "write": true,
          "edit": true,
          "bash": true,
          "glob": true,
          "grep": true,
          "skill": false,
          "webfetch": false,
          "websearch": false,
          "screenshot": false,
          "task": false,
        } } : {}),
      })

      // 等待 AI 完成回复（只关注新消息）
      const response = await this.waitForCompletion(sessionID, controller.signal, baselineCount, chatId, autoApprove)

      return response
    } catch (err: any) {
      if (err.name === "AbortError") {
        return "⏹️ 任务已取消"
      }
      log.error("Helix 任务执行失败", { message: err.message, name: err.name, stack: err.stack?.slice(0, 200), response: err.response?.data })
      return `❌ Agent 执行失败: ${err.message}`
    } finally {
      this.runningTasks.delete(chatId)
      // 取消事件订阅
      const sessionID = this.sessions.get(chatId)
      if (sessionID) {
        this.alignmentNotifier.unregisterChat(sessionID)
        this.eventBridge.unsubscribe(sessionID)
      }
    }
  }

  /** 自适应超时配置 */
  private static readonly TIMEOUT_CONFIG = {
    baseTimeout: 5 * 60 * 1000,      // 基础超时 5 分钟
    extensionTime: 5 * 60 * 1000,    // 每次延长 5 分钟
    maxExtensions: 4,                 // 最大延长 4 次
    maxTotalTime: 25 * 60 * 1000,    // 总超时上限 25 分钟
    pollInterval: 3000,               // 轮询间隔 3 秒
    maxSteps: 20,                     // 最大步骤数（仅用于日志）
  }

  /** 偏离状态检测：评估任务是否在正常推进 */
  private evaluateDeviation(messages: any[]): { shouldExtend: boolean; reason: string } {
    const assistantMessages = messages.filter((m: any) => m.info?.role === "assistant")
    const lastAssistant = assistantMessages[assistantMessages.length - 1]

    if (!lastAssistant) {
      return { shouldExtend: false, reason: "无 assistant 消息" }
    }

    // 检查最近 3 条 assistant 消息是否有工具调用（不只是最后一条）
    const recentAssistants = assistantMessages.slice(-3)
    const recentToolCalls = recentAssistants.flatMap((m: any) =>
      (m.parts ?? []).filter((p: any) => p.type === "tool")
    )
    const hasRecentToolCalls = recentToolCalls.length > 0

    // 死循环检测：最近 3 条消息的工具调用签名完全相同
    if (assistantMessages.length >= 3) {
      const last3 = assistantMessages.slice(-3)
      const signatures = last3.map((m: any) => {
        const tools = (m.parts ?? []).filter((p: any) => p.type === "tool")
        return tools.map((p: any) => p.tool + ":" + JSON.stringify(p.state?.input || {}).slice(0, 100)).join("|")
      })
      if (signatures[0] && signatures[0] === signatures[1] && signatures[1] === signatures[2]) {
        return { shouldExtend: false, reason: "死循环: 最近 3 步工具调用完全相同" }
      }
    }

    // 检查最近的 tool 调用
    const recentParts = lastAssistant.parts ?? []
    const toolCalls = recentParts.filter((p: any) => p.type === "tool")
    const hasNewToolCalls = toolCalls.length > 0

    // 检查是否有错误
    const hasErrors = recentToolCalls.some((p: any) => p.state?.status === "error")

    // 检查是否有输出变化（通过检查 tool 输出是否为空）
    const hasOutput = recentToolCalls.some((p: any) => {
      const output = p.state?.output
      return output && output.length > 0
    })

    // question 工具等待用户输入时视为正常推进
    const hasRunningQuestion = toolCalls.some((p: any) => p.tool === "question" && p.state?.status === "running")

    const stepCount = assistantMessages.length

    // 只有在 agent 没有实际进展时才拒绝延长
    if (hasErrors && !hasRecentToolCalls) {
      return { shouldExtend: false, reason: "存在错误且无新工具调用" }
    }

    if (!hasRecentToolCalls) {
      return { shouldExtend: false, reason: "无新的工具调用" }
    }

    if (!hasOutput && !hasRunningQuestion) {
      return { shouldExtend: false, reason: "工具调用无输出" }
    }

    // agent 有新工具调用且有输出或正在等待用户输入 → 允许延长
    return { shouldExtend: true, reason: `正常推进 (步骤 ${stepCount}, 有新输出)` }
  }

  /** 打印智能体当前进度 */
  private printProgress(messages: any[]) {
    const lastAssistant = [...messages].reverse().find((m: any) => m.info?.role === "assistant")
    if (!lastAssistant) return

    const parts = lastAssistant.parts ?? []
    const elapsed = Math.round((Date.now() - Date.now()) / 1000)

    // 打印推理过程
    const reasoning = parts.find((p: any) => p.type === "reasoning")
    if (reasoning?.text) {
      console.log(`\n🤔 智能体思考: ${reasoning.text.slice(0, 150)}...`)
    }

    // 打印工具调用
    const toolCalls = parts.filter((p: any) => p.type === "tool")
    for (const tool of toolCalls) {
      const toolName = tool.tool || "?"
      const status = tool.state?.status || "?"
      const input = tool.state?.input
      const statusIcon = status === "completed" ? "✅" : status === "running" ? "🔄" : "❌"

      let detail = ""
      if (toolName === "bash" && input?.command) {
        detail = `命令: ${input.command.slice(0, 60)}`
      } else if (toolName === "read" && input?.filePath) {
        detail = `文件: ${input.filePath}`
      } else if (toolName === "write" && input?.filePath) {
        detail = `写入: ${input.filePath}`
      } else if (input) {
        detail = JSON.stringify(input).slice(0, 60)
      }

      console.log(`${statusIcon} [${toolName}] ${detail}`)
    }
  }

  /** 获取 session 当前消息数量 */
  private async getMessageCount(sessionID: string): Promise<number> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }
    const resp = await fetch(`${config.helix.url}/session/${sessionID}/message`, { headers })
    const messages: any[] = await resp.json()
    return messages.length
  }

  /** 等待 session 完成回复（自适应超时） */
  private async waitForCompletion(sessionID: string, signal: AbortSignal, baselineCount = 0, chatId: string, autoApprove = false): Promise<string> {
    const { baseTimeout, extensionTime, maxExtensions, maxTotalTime, pollInterval } = SessionManager.TIMEOUT_CONFIG
    const startTime = Date.now()
    let currentDeadline = startTime + baseTimeout
    let extensionCount = 0
    let lastDeviationCheck = 0
    let emptyMessageCount = 0

    // 构建认证头
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

      // 启动权限事件监听（后台运行）
      const permissionMonitor = this.startPermissionMonitor(sessionID, headers, chatId, autoApprove)

    while (Date.now() < currentDeadline) {
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }

      try {
        // 直接调用 API 获取 messages（SDK 会丢失 time.completed 字段）
        const url = `${config.helix.url}/session/${sessionID}/message`
        const resp = await fetch(url, { headers })
        const messages: any[] = await resp.json()

        log.info("轮询消息", { sessionID, messageCount: messages.length, baselineCount })

        // 打印智能体当前进度
        this.printProgress(messages)

        // 只关注新消息（baseline 之后出现的）
        const newMessages = messages.slice(baselineCount)
        const assistantMessages = newMessages.filter((m: any) => m.info?.role === "assistant")

        // 检查最后一个 assistant 消息是否完成
        if (assistantMessages.length > 0) {
          const lastAssistant = assistantMessages[assistantMessages.length - 1]
          const completed = lastAssistant.info?.time?.completed
          const parts = lastAssistant.parts ?? []

          // 检查是否有文本输出
          const textParts = parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n")

          // 检查是否有工具调用
          const toolCalls = parts.filter((p: any) => p.type === "tool")
          const hasRunningTool = toolCalls.some((p: any) => p.state?.status === "running")

          // 只有当消息完成且有文本输出时，才认为任务真正完成
          if (completed && textParts && !hasRunningTool) {
            log.info("任务完成", { completed, elapsed: Date.now() - startTime })
            permissionMonitor.stop()
            return textParts
          }

          // 如果消息完成但没有文本输出，且没有正在运行的工具，可能是纯工具调用步骤
          if (completed && !textParts && !hasRunningTool) {
            if (parts.length === 0) {
              // 空消息 — agent 没有产生任何内容
              emptyMessageCount++
              log.info("检测到空消息", { emptyMessageCount, messageCount: messages.length })
              if (emptyMessageCount >= 2) {
                permissionMonitor.stop()
                throw new Error("Agent 连续产生空消息，可能模型异常或 session 状态损坏")
              }
            } else {
              log.info("步骤完成，继续等待", { messageCount: messages.length })
            }
          }
        }

        // 接近超时时进行偏离检测（更频繁检查）
        const timeToDeadline = currentDeadline - Date.now()
        if (timeToDeadline < 60000 && Date.now() - lastDeviationCheck > 15000) {
          lastDeviationCheck = Date.now()
          const { shouldExtend, reason } = this.evaluateDeviation(newMessages)
          const totalElapsed = Date.now() - startTime

          log.info("偏离状态评估", { shouldExtend, reason, extensionCount, totalElapsed })

          if (shouldExtend && extensionCount < maxExtensions && totalElapsed + extensionTime <= maxTotalTime) {
            extensionCount++
            currentDeadline += extensionTime
            log.info("延长超时", { extensionCount, newDeadline: currentDeadline, reason })
          } else if (!shouldExtend) {
            log.info("任务偏离，准备终止", { reason })
            permissionMonitor.stop()
            throw new Error(`任务执行超时: ${reason}`)
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") throw err
        if (err.message?.startsWith("任务执行超时")) throw err
        if (err.message?.startsWith("Agent 连续产生空消息")) throw err
        log.warn("轮询消息失败", { error: err.message })
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    permissionMonitor.stop()
    throw new Error(`任务执行超时（已延长 ${extensionCount} 次，总耗时 ${Math.round((Date.now() - startTime) / 1000)}s）`)
  }

  /** 启动权限事件监控器（后台运行） */
  private startPermissionMonitor(sessionID: string, headers: Record<string, string>, chatId: string, autoApprove = false) {
    let stopped = false
    const processedRequests = new Set<string>()

    const monitor = async () => {
      while (!stopped) {
        try {
          // 检查是否有待处理的权限请求
          const url = `${config.helix.url}/session/${sessionID}/message`
          const resp = await fetch(url, { headers })
          const messages: any[] = await resp.json()

          // 查找 question 工具调用（权限请求会触发 AskUserQuestion）
          for (const msg of messages) {
            if (msg.info?.role !== "assistant") continue
            const parts = msg.parts ?? []
            for (const part of parts) {
              if (part.type !== "tool" || part.tool !== "question") continue
              if (part.state?.status !== "running") continue
              
              const callID = part.callID
              if (!callID || processedRequests.has(callID)) continue
              
              // 找到新的权限请求
              log.info("检测到权限请求", { callID, sessionID, autoApprove })
              processedRequests.add(callID)

              // 解析问题内容
              const questions = part.state?.input?.questions || []
              const questionText = questions[0]?.question || "未知权限请求"

              if (autoApprove) {
                // 自动开发模式：自动批准权限
                log.info("自动批准权限请求", { callID })
                await this.autoAnswerQuestion(sessionID, { callID })
              } else {
                // 正常模式：转发到飞书
                const permissionMessage = `🔐 **权限请求**\n\n${questionText}\n\n请回复:\n- \`允许\` 或 \`yes\` - 批准\n- \`拒绝\` 或 \`no\` - 拒绝`
                await this.sendText(chatId, permissionMessage)

                // 存储待处理的权限请求
                this.pendingPermissions.set(callID, {
                  sessionID,
                  chatId,
                  callID,
                  questionText,
                  timestamp: Date.now()
                })
              }
            }
          }
        } catch (err) {
          // 忽略错误，继续监控
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // 后台运行监控
    monitor().catch(() => {})

    return {
      stop: () => { stopped = true }
    }
  }

  /** 自动回答 AskUserQuestion（完全自主模式） */
  private async autoAnswerQuestion(sessionID: string, questionTool: any) {
    const callID = questionTool.callID
    if (!callID) return

    // 构建认证头
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

    // 自动回答
    const answer = "继续执行，不需要用户确认。请使用本地可用的资源自主完成任务。"
    
    try {
      const url = `${config.helix.url}/session/${sessionID}/tool/${callID}`
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ output: answer }),
      })
      
      if (resp.ok) {
        log.info("自动回答成功", { callID, answer })
      } else {
        log.warn("自动回答失败", { status: resp.status, statusText: resp.statusText })
      }
    } catch (err: any) {
      log.warn("自动回答异常", { error: err.message })
    }
  }

  /** 回复权限请求（通过回答 question 工具） */
  async replyPermission(callID: string, approved: boolean): Promise<boolean> {
    // 从待处理权限请求中获取信息
    const pending = this.pendingPermissions.get(callID)
    if (!pending) {
      log.warn("未找到待处理的权限请求", { callID })
      return false
    }

    // 如果没有 sessionID，说明是通过 API 创建的权限请求，直接返回成功
    if (!pending.sessionID) {
      log.info("API 创建的权限请求，直接批准", { callID, approved })
      this.pendingPermissions.delete(callID)
      return true
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

    const sessionID = pending.sessionID
    const answer = approved 
      ? "允许，用户已批准此操作。请继续执行。" 
      : "拒绝，用户拒绝了此操作。请停止并告知用户。"
    
    try {
      const url = `${config.helix.url}/session/${sessionID}/tool/${callID}`
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ output: answer }),
      })
      
      if (resp.ok) {
        log.info("权限回复成功", { callID, approved })
        this.pendingPermissions.delete(callID)
        return true
      } else {
        log.warn("权限回复失败", { status: resp.status, statusText: resp.statusText })
        return false
      }
    } catch (err: any) {
      log.warn("权限回复异常", { error: err.message })
      return false
    }
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

  /** 停止全局通知器 */
  stop() {
    this.alignmentNotifier.stop()
  }

  isRunning(chatId: string): boolean {
    return this.runningTasks.has(chatId)
  }

  /** 清除 chat 的 session（用于 /new 命令） */
  clearSession(chatId: string) {
    this.sessions.delete(chatId)
  }

  /** 检查是否有待处理的权限请求 */
  hasPendingPermission(chatId: string): boolean {
    for (const [_, pending] of this.pendingPermissions) {
      if (pending.chatId === chatId) return true
    }
    return false
  }

  /** 获取待处理的权限请求 */
  getPendingPermission(chatId: string): any | null {
    for (const [_, pending] of this.pendingPermissions) {
      if (pending.chatId === chatId) return pending
    }
    return null
  }

  /** 清除待处理的权限请求 */
  clearPendingPermission(chatId: string) {
    for (const [key, pending] of this.pendingPermissions) {
      if (pending.chatId === chatId) {
        this.pendingPermissions.delete(key)
        break
      }
    }
  }

  /** 添加待处理的权限请求 */
  addPendingPermission(chatId: string, permission: any) {
    this.pendingPermissions.set(permission.callID, {
      ...permission,
      chatId,
      timestamp: Date.now()
    })
    log.info("添加待处理权限请求", { chatId, callID: permission.callID })
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
