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

/**
 * Event Bridge：订阅 Helix SSE 事件流，将关键事件反向推送到飞书。
 */
export class EventBridge {
  private controllers = new Map<string, AbortController>()
  private cards = new CardBuilder()
  private traceBuffers = new Map<string, TraceNode[]>()
  private traceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * 订阅指定 session 的 Helix 事件流。
   * 监听到 AlignmentAlert / session 状态变化时，通过回调推到飞书。
   */
  subscribe(sessionID: string, chatId: string, onMsg: OnMessage, onCard: OnCard) {
    const ctrl = new AbortController()
    this.controllers.set(sessionID, ctrl)
    this.traceBuffers.set(sessionID, [])

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

              if (event.type === "observability.alignment_alert") {
                const props = event.properties ?? {}
                const card = this.cards.buildAlignmentAlertCard({
                  level: props.level ?? "warn",
                  reason: props.reason ?? "未知偏离",
                  suggestion: props.suggestion ?? "请检查 Agent 执行状态",
                  sessionID: props.sessionID ?? sessionID,
                  files: props.files,
                })
                log.info("发送偏离告警卡片到飞书", { level: props.level, reason: props.reason?.slice(0, 60) })
                onCard({ type: "alignment_alert", card, chatId })
              }

              if (event.type === "session.status") {
                const status = event.properties?.status
                if (status?.type === "idle") {
                  this.flushTraceTree(sessionID, chatId, onCard, true)
                  onMsg("✅ 任务执行完成。")
                  this.unsubscribe(sessionID)
                }
              }

              if (event.type === "permission.asked") {
                log.info("收到权限请求", { event: event.properties })
                onCard(event.properties)
              }

              if (event.type === "observability.trace_node") {
                this.accumulateTrace(sessionID, chatId, event.properties, onCard)
              }
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
  }
}
