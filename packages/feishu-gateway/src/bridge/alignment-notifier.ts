import { config } from "../config"
import { CardBuilder } from "../cards/card-builder"
import { Logger } from "../logger"

const log = Logger.create("alignment")

interface AlertPayload {
  sessionID: string
  level: "warn" | "critical"
  reason: string
  suggestion: string
  files?: string[]
  timestamp: number
}

/**
 * AlignmentNotifier: 全局订阅 Helix SSE 事件流，
 * 当任何 session 产生 AlignmentAlert 偏离告警时，
 * 将告警卡片推送到对应的飞书群。
 *
 * 与 EventBridge（per-session，仅限飞书发起的任务）不同，
 * AlignmentNotifier 监听全局事件，覆盖所有 session（包括 CLI/API 发起的任务）。
 */
export class AlignmentNotifier {
  private cards = new CardBuilder()
  private activeChats = new Map<string, string>() // sessionID → chatId
  private sentAlerts = new Set<string>()
  private cooldowns = new Map<string, number>()
  private abortCtrl: AbortController | null = null
  private sendCard: (chatId: string, card: unknown) => Promise<void>

  private static readonly RECONNECT_MS = 5_000
  private static readonly MAX_COOLDOWN_MS = 30_000

  constructor(sendCard: (chatId: string, card: unknown) => Promise<void>) {
    this.sendCard = sendCard
  }

  start() {
    this.connect()
  }

  stop() {
    this.abortCtrl?.abort()
    this.abortCtrl = null
  }

  registerChat(sessionID: string, chatId: string) {
    this.activeChats.set(sessionID, chatId)
  }

  unregisterChat(sessionID: string) {
    this.activeChats.delete(sessionID)
    this.cooldowns.delete(sessionID)
  }

  private connect() {
    this.abortCtrl?.abort()
    this.abortCtrl = new AbortController()

    const headers: Record<string, string> = {}
    if (config.helix.password) {
      const auth = Buffer.from(`mimocode:${config.helix.password}`).toString("base64")
      headers["Authorization"] = `Basic ${auth}`
    }

    const url = `${config.helix.url}/global/event`
    log.info("订阅全局事件流", { url })

    fetch(url, { signal: this.abortCtrl.signal, headers })
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
              const envelope = JSON.parse(match[1])
              const event = envelope.payload
              if (event?.type === "observability.alignment_alert") {
                await this.handleAlert(event.properties as AlertPayload)
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      })
      .catch((e) => {
        if (e.name === "AbortError") return
        log.error("全局事件流断开，将重连", e)
        setTimeout(() => this.connect(), AlignmentNotifier.RECONNECT_MS)
      })
  }

  private async handleAlert(alert: AlertPayload) {
    const { sessionID, level, reason, suggestion, files } = alert
    const dedupKey = `${sessionID}:${level}:${reason.slice(0, 80)}`

    if (this.sentAlerts.has(dedupKey)) return
    this.sentAlerts.add(dedupKey)
    setTimeout(() => this.sentAlerts.delete(dedupKey), 5 * 60_000)

    const last = this.cooldowns.get(sessionID) ?? 0
    if (Date.now() - last < AlignmentNotifier.MAX_COOLDOWN_MS) return
    this.cooldowns.set(sessionID, Date.now())

    const chatId = this.activeChats.get(sessionID)
    if (!chatId) {
      log.info("收到偏离告警但无活跃飞书会话", { sessionID, level, reason: reason.slice(0, 60) })
      return
    }

    const card = this.cards.buildAlignmentAlertCard({ level, reason, suggestion, sessionID, files })
    log.info("发送偏离告警到飞书", { sessionID, level, reason: reason.slice(0, 60), chatId })
    await this.sendCard(chatId, card)
  }
}
