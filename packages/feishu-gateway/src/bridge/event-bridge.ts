import { config } from "../config"
import { CardBuilder } from "../cards/card-builder"
import { Logger } from "../logger"

const log = Logger.create("events")

type OnMessage = (text: string) => void
type OnCard = (card: unknown) => void

interface TraceNode {
  id: string
  parentId?: string
  type: string
  name: string
  status: "pending" | "success" | "failed"
  metadata?: Record<string, unknown>
  timestamp: number
  children?: TraceNode[]
  duration?: number
}

interface StreamingState {
  textBuffer: string
  toolCalls: Map<string, { name: string; input: string; status: "running" | "done" | "error"; output?: string }>
  lastFlush: number
  flushTimer: ReturnType<typeof setTimeout> | null
  pendingFlush: boolean
}

/**
 * Event Bridge：订阅 Helix SSE 事件流，将 Agent 执行的全量事件反向推送到飞书。
 *
 * 支持的事件类型：
 * - message.part.delta: 文本流式输出 + 工具调用实时状态
 * - session.status: 会话状态变化（idle/busy/retry）
 * - session.error: 会话错误
 * - permission.asked: 权限请求
 * - question.asked: 用户追问
 * - observability.alignment_alert: 偏离告警
 * - observability.trace_node: 执行追踪树
 * - metrics.tool_call: 工具调用完成指标
 * - workflow.*: 工作流生命周期事件
 */
export class EventBridge {
  private controllers = new Map<string, AbortController>()
  private cards = new CardBuilder()
  private traceBuffers = new Map<string, TraceNode[]>()
  private traceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private streamingStates = new Map<string, StreamingState>()

  /**
   * 订阅指定 session 的 Helix 事件流。
   * 监听全量 Agent 事件并通过回调推送到飞书。
   */
  subscribe(sessionID: string, chatId: string, onMsg: OnMessage, onCard: OnCard) {
    const ctrl = new AbortController()
    this.controllers.set(sessionID, ctrl)
    this.traceBuffers.set(sessionID, [])
    this.streamingStates.set(sessionID, {
      textBuffer: "",
      toolCalls: new Map(),
      lastFlush: 0,
      flushTimer: null,
      pendingFlush: false,
    })

    const url = `${config.helix.url}/event`
    log.info("订阅 Helix 事件流", { sessionID })

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split("\n\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const match = line.match(/^data:\s*(.+)$/)
            if (!match) continue
            try {
              const event = JSON.parse(match[1])
              const props = event.properties ?? {}

              // 过滤非本 session 的事件
              if (props.sessionID && props.sessionID !== sessionID) continue

              this.handleEvent(event, sessionID, chatId, onMsg, onCard)
            } catch {
              // ignore parse errors
            }
          }
        }
      })
      .catch((e) => {
        if (e.name === "AbortError") return
        log.error("Event SSE 连接断开", e)
      })
  }

  private handleEvent(event: { type: string; properties?: Record<string, unknown> }, sessionID: string, chatId: string, onMsg: OnMessage, onCard: OnCard) {
    const props = event.properties ?? {}

    switch (event.type) {
      case "message.part.delta":
        this.handlePartDelta(props, sessionID, chatId, onCard)
        break

      case "session.status":
        this.handleSessionStatus(props, sessionID, chatId, onMsg, onCard)
        break

      case "session.error":
        this.handleSessionError(props, sessionID, chatId, onCard)
        break

      case "permission.asked":
        log.info("收到权限请求", { event: props })
        onCard(props)
        break

      case "question.asked":
        log.info("收到追问请求", { event: props })
        onCard({ type: "question", ...props })
        break

      case "observability.alignment_alert":
        this.handleAlignmentAlert(props, sessionID, chatId, onCard)
        break

      case "observability.trace_node":
        this.accumulateTrace(sessionID, chatId, props as unknown as TraceNode, onCard)
        break

      case "metrics.tool_call":
        this.handleToolCallMetric(props, sessionID)
        break

      case "workflow.started":
      case "workflow.finished":
      case "workflow.phase":
        this.handleWorkflowEvent(event.type, props, sessionID, chatId, onCard)
        break

      default:
        // 未知事件类型不处理
        break
    }
  }

  /** 处理 message.part.delta：文本流式输出 + 工具调用状态 */
  private handlePartDelta(props: Record<string, unknown>, sessionID: string, chatId: string, onCard: OnCard) {
    const field = props.field as string
    const delta = props.delta as string
    const state = this.streamingStates.get(sessionID)
    if (!state) return

    if (field === "text") {
      state.textBuffer += delta
      this.scheduleStreamingFlush(sessionID, chatId, onCard)
    } else if (field === "tool-call") {
      const toolID = props.partID as string || props.id as string || "unknown"
      const existing = state.toolCalls.get(toolID)
      if (existing) {
        existing.input += delta
      } else {
        state.toolCalls.set(toolID, {
          name: (props.name as string) || "tool",
          input: delta,
          status: "running",
        })
      }
      this.scheduleStreamingFlush(sessionID, chatId, onCard)
    } else if (field === "tool-result") {
      const toolID = props.partID as string || props.id as string || "unknown"
      const existing = state.toolCalls.get(toolID)
      if (existing) {
        existing.status = "done"
        existing.output = delta
      }
      this.scheduleStreamingFlush(sessionID, chatId, onCard)
    }
  }

  /** 批量刷新流式内容到飞书（3秒去抖） */
  private scheduleStreamingFlush(sessionID: string, chatId: string, onCard: OnCard) {
    const state = this.streamingStates.get(sessionID)
    if (!state) return

    const now = Date.now()
    if (now - state.lastFlush < 3000) {
      if (!state.flushTimer) {
        state.flushTimer = setTimeout(() => {
          state.flushTimer = null
          this.flushStreamingState(sessionID, chatId, onCard)
        }, 3000)
      }
      return
    }

    this.flushStreamingState(sessionID, chatId, onCard)
  }

  private flushStreamingState(sessionID: string, chatId: string, onCard: OnCard) {
    const state = this.streamingStates.get(sessionID)
    if (!state) return

    const hasText = state.textBuffer.length > 0
    const hasTools = state.toolCalls.size > 0
    if (!hasText && !hasTools) return

    const card = this.cards.buildStreamingUpdateCard({
      sessionID,
      text: state.textBuffer,
      toolCalls: Array.from(state.toolCalls.entries()).map(([id, t]) => ({
        id,
        name: t.name,
        input: t.input,
        status: t.status,
        output: t.output,
      })),
    })

    log.info("发送流式更新卡片到飞书", {
      sessionID,
      textLen: state.textBuffer.length,
      toolCount: state.toolCalls.size,
    })
    onCard({ type: "streaming_update", card, chatId })

    state.textBuffer = ""
    state.toolCalls.clear()
    state.lastFlush = Date.now()
  }

  /** 处理 session.status 事件 */
  private handleSessionStatus(props: Record<string, unknown>, sessionID: string, chatId: string, onMsg: OnMessage, onCard: OnCard) {
    const status = props.status as { type: string } | undefined
    if (!status) return

    if (status.type === "idle") {
      this.flushStreamingState(sessionID, chatId, onCard)
      this.flushTraceTree(sessionID, chatId, onCard, true)
      onMsg("✅ 任务执行完成。")
      this.unsubscribe(sessionID)
    } else if (status.type === "busy") {
      log.info("Session 进入忙碌状态", { sessionID })
    }
  }

  /** 处理 session.error 事件 */
  private handleSessionError(props: Record<string, unknown>, sessionID: string, chatId: string, onCard: OnCard) {
    const error = props.error as { message?: string } | undefined
    const errorMsg = error?.message ?? "未知错误"

    log.error("Session 错误", { sessionID, error: errorMsg })

    const card = this.cards.buildErrorCard({
      sessionID,
      error: errorMsg,
    })
    onCard({ type: "session_error", card, chatId })
  }

  /** 处理偏离告警事件 */
  private handleAlignmentAlert(props: Record<string, unknown>, sessionID: string, chatId: string, onCard: OnCard) {
    const card = this.cards.buildAlignmentAlertCard({
      level: (props.level as "warn" | "critical") ?? "warn",
      reason: (props.reason as string) ?? "未知偏离",
      suggestion: (props.suggestion as string) ?? "请检查 Agent 执行状态",
      sessionID: (props.sessionID as string) ?? sessionID,
      files: props.files as string[] | undefined,
    })
    log.info("发送偏离告警卡片到飞书", { level: props.level, reason: (props.reason as string)?.slice(0, 60) })
    onCard({ type: "alignment_alert", card, chatId })
  }

  /** 处理工具调用指标事件 */
  private handleToolCallMetric(props: Record<string, unknown>, _sessionID: string) {
    const toolName = props.tool_name as string
    const status = props.tool_call_status as string
    const latencyMs = props.latency_ms as number | undefined

    log.info("工具调用完成", {
      tool: toolName,
      status,
      latencyMs,
      inputBytes: props.input_bytes,
      outputBytes: props.output_bytes,
    })
  }

  /** 处理工作流生命周期事件 */
  private handleWorkflowEvent(type: string, props: Record<string, unknown>, _sessionID: string, chatId: string, onCard: OnCard) {
    log.info("工作流事件", { type, props })

    if (type === "workflow.finished") {
      const status = props.status as string
      const error = props.error as string | undefined
      const card = this.cards.buildWorkflowResultCard({
        runID: props.runID as string,
        status,
        error,
      })
      onCard({ type: "workflow_result", card, chatId })
    }
  }

  private accumulateTrace(sessionID: string, chatId: string, node: TraceNode, onCard: OnCard) {
    const buf = this.traceBuffers.get(sessionID)
    if (!buf) return

    const existing = buf.findIndex((n) => n.id === node.id)
    if (existing >= 0) {
      buf[existing] = { ...buf[existing], ...node }
    } else {
      buf.push(node)
    }

    if (this.traceTimers.has(sessionID)) return
    this.traceTimers.set(sessionID, setTimeout(() => {
      this.traceTimers.delete(sessionID)
      this.flushTraceTree(sessionID, chatId, onCard)
    }, 3000))
  }

  private flushTraceTree(sessionID: string, chatId: string, onCard: OnCard, isFinal = false) {
    const buf = this.traceBuffers.get(sessionID)
    if (!buf?.length) return

    const roots = this.buildTree(buf)
    const steps = roots.map((root) => ({
      name: root.name,
      status: root.status,
      duration: root.duration,
      detail: this.extractDetail(root),
      children: root.children?.map((c) => ({
        name: c.name,
        status: c.status,
        duration: c.duration,
        detail: this.extractDetail(c),
      })),
    }))

    const totalDuration = roots.length
      ? Math.max(...roots.map((r) => (r.timestamp ?? 0) + (r.duration ?? 0))) - Math.min(...roots.map((r) => r.timestamp ?? 0))
      : undefined

    const card = this.cards.buildExecutionTreeCard({ sessionID, steps, totalDuration, isFinal })
    log.info("发送执行树卡片到飞书", { stepCount: steps.length, sessionID, isFinal })
    onCard({ type: "execution_tree", card, chatId })
  }

  private buildTree(nodes: TraceNode[]): TraceNode[] {
    const map = new Map<string, TraceNode>()
    const roots: TraceNode[] = []

    for (const n of nodes) {
      map.set(n.id, { ...n, children: [] })
    }
    for (const n of nodes) {
      const node = map.get(n.id)!
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children!.push(node)
      } else {
        roots.push(node)
      }
    }

    const addDuration = (node: TraceNode): TraceNode => {
      if (node.children?.length) {
        node.children = node.children.map(addDuration)
      }
      if (node.type === "node_end" || node.type === "error") {
        return node
      }
      if (node.children?.length) {
        const childEnds = node.children.map((c) =>
          (c.type === "node_end" || c.type === "error")
            ? c.timestamp
            : c.timestamp + (c.duration ?? 0)
        )
        node.duration = Math.max(...childEnds) - node.timestamp
      }
      return node
    }

    return roots.map(addDuration)
  }

  private extractDetail(node: TraceNode): string | undefined {
    const meta = node.metadata
    if (!meta) return undefined
    if (typeof meta.error === "string") return `❌ ${meta.error.slice(0, 120)}`
    if (typeof meta.output === "string" && meta.output) return `→ ${meta.output.slice(0, 120)}`
    if (typeof meta.result === "string") return `result: ${meta.result.slice(0, 100)}`
    if (typeof meta.finishReason === "string") {
      const tokens = meta.tokens as Record<string, number> | undefined
      const parts = [`finish: ${meta.finishReason}`]
      if (tokens?.input) parts.push(`in:${tokens.input}`)
      if (tokens?.output) parts.push(`out:${tokens.output}`)
      return parts.join(" · ")
    }
    if (typeof meta.input === "object" && meta.input) {
      const input = meta.input as Record<string, unknown>
      if (input.command) return `⌘ ${String(input.command).slice(0, 120)}`
      if (input.filePath) return `📄 ${String(input.filePath)}`
      if (input.pattern) return `🔍 ${String(input.pattern)}`
      if (input.description) return String(input.description).slice(0, 120)
      if (input.query) return `🔍 ${String(input.query).slice(0, 100)}`
      if (input.url) return `🌐 ${String(input.url).slice(0, 100)}`
    }
    if (typeof meta.agent === "string") return `agent: ${meta.agent}`
    if (typeof meta.result === "object" && meta.result) {
      const r = meta.result as Record<string, unknown>
      if (typeof r.summary === "string") return r.summary.slice(0, 100)
    }
    return undefined
  }

  unsubscribe(sessionID: string) {
    const ctrl = this.controllers.get(sessionID)
    if (ctrl) {
      ctrl.abort()
      this.controllers.delete(sessionID)
    }
    this.traceBuffers.delete(sessionID)
    const timer = this.traceTimers.get(sessionID)
    if (timer) {
      clearTimeout(timer)
      this.traceTimers.delete(sessionID)
    }
    const state = this.streamingStates.get(sessionID)
    if (state?.flushTimer) {
      clearTimeout(state.flushTimer)
    }
    this.streamingStates.delete(sessionID)
  }
}
