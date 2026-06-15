import { Logger } from "../logger"

const log = Logger.create("feishu-ws")

export interface FeishuEvent {
  type: string
  event?: {
    sender?: { sender_id?: { open_id?: string } }
    message?: {
      message_id?: string
      chat_id?: string
      chat_type?: string
      content?: string
      message_type?: string
    }
  }
}

export type MessageHandler = (event: FeishuEvent, raw: string) => Promise<void>

/**
 * 飞书 WebSocket 长连接客户端。
 * 通过飞书开放平台的 /events/v1/subscription 获取连接地址，
 * 建立 outbound WebSocket，收到消息后分发给注册的 handler。
 */
export class FeishuWSClient {
  private ws: WebSocket | null = null
  private reconnectTimer: Timer | undefined
  private retryCount = 0
  private maxRetry = 10

  constructor(
    private appId: string,
    private appSecret: string,
    private domain: "feishu" | "lark",
    private handler: MessageHandler,
  ) {}

  async start() {
    const token = await this.getAccessToken()
    const wsUrl = await this.getWSConnectionUrl(token)
    await this.connect(wsUrl)
  }

  async stop() {
    clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  // ---- private ----

  private async getAccessToken(): Promise<string> {
    const baseHost = this.domain === "lark" ? "open.larksuite.com" : "open.feishu.cn"
    const res = await fetch(`https://${baseHost}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    })
    const data = await res.json() as { tenant_access_token?: string; code?: number; msg?: string }
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`获取 tenant_access_token 失败: ${data.msg ?? JSON.stringify(data)}`)
    }
    log.info("tenant_access_token 获取成功")
    return data.tenant_access_token
  }

  private async getWSConnectionUrl(token: string): Promise<string> {
    const baseHost = this.domain === "lark" ? "open.larksuite.com" : "open.feishu.cn"
    const res = await fetch(`https://${baseHost}/open-apis/ws/v1/connection`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as { code?: number; data?: { ws_url?: string }; msg?: string }
    if (data.code !== 0 || !data.data?.ws_url) {
      throw new Error(`获取 WebSocket 连接地址失败: ${data.msg ?? JSON.stringify(data)}`)
    }
    log.info(`WebSocket 连接地址获取成功: ${data.data.ws_url.slice(0, 80)}...`)
    return data.data.ws_url
  }

  private async connect(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.retryCount = 0
      log.info("WebSocket 已连接")
    }

    this.ws.onmessage = async (evt) => {
      try {
        const raw = typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data)
        const event = JSON.parse(raw) as FeishuEvent
        await this.handler(event, raw)
      } catch {
        // 忽略解析错误，避免断开连接
      }
    }

    this.ws.onclose = (evt) => {
      log.warn(`WebSocket 已关闭 (code: ${evt.code}, reason: ${evt.reason})`)
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      log.error("WebSocket 连接错误", err)
    }
  }

  private scheduleReconnect() {
    if (this.retryCount >= this.maxRetry) {
      log.error(`重连次数已达上限 (${this.maxRetry})，退出`)
      process.exit(1)
    }
    const delay = Math.min(1000 * 2 ** this.retryCount, 60000)
    this.retryCount++
    log.info(`将在 ${delay}ms 后第 ${this.retryCount} 次重连...`)
    this.reconnectTimer = setTimeout(() => this.start().catch((e) => log.error("重连失败", e)), delay)
  }
}
