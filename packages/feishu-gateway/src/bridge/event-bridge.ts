import { config } from "../config"
import { CardBuilder } from "../cards/card-builder"
import { Logger } from "../logger"

const log = Logger.create("events")

type OnMessage = (text: string) => void
type OnCard = (card: unknown) => void

/**
 * Event Bridge：订阅 Helix SSE 事件流，将关键事件反向推送到飞书。
 */
export class EventBridge {
  private controllers = new Map<string, AbortController>()
  private cards = new CardBuilder()

  /**
   * 订阅指定 session 的 Helix 事件流。
   * 监听到 AlignmentAlert / session 状态变化时，通过回调推到飞书。
   */
  subscribe(sessionID: string, chatId: string, onMsg: OnMessage, onCard: OnCard) {
    const ctrl = new AbortController()
    this.controllers.set(sessionID, ctrl)

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
                  onMsg("✅ 任务执行完成。")
                  this.unsubscribe(sessionID)
                }
              }
              // 权限请求事件
              if (event.type === "permission.asked") {
                log.info("收到权限请求", { event: event.properties })
                onCard(event.properties)
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

  unsubscribe(sessionID: string) {
    const ctrl = this.controllers.get(sessionID)
    if (ctrl) {
      ctrl.abort()
      this.controllers.delete(sessionID)
    }
  }
}
