import type {
  CommunicationAdapter,
  ConnectionConfig,
  ConnectionStatus,
  Subscription,
} from "./types"

export class HttpAdapter implements CommunicationAdapter {
  private config: ConnectionConfig | null = null
  private _status: ConnectionStatus = "disconnected"
  private _latency = 0

  get status(): ConnectionStatus {
    return this._status
  }

  get latency(): number {
    return this._latency
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config
    this._status = "connected"
  }

  async disconnect(): Promise<void> {
    this.config = null
    this._status = "disconnected"
  }

  async request<T>(endpoint: string, data?: unknown): Promise<T> {
    if (!this.config) throw new Error("Not connected")

    const url = `${this.config.endpoint}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.getAuthHeaders(),
    }

    const start = Date.now()
    const response = await fetch(url, {
      method: data ? "POST" : "GET",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
    this._latency = Date.now() - start

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.json()
  }

  async *stream<T>(endpoint: string, data?: unknown): AsyncGenerator<T> {
    if (!this.config) throw new Error("Not connected")

    const url = `${this.config.endpoint}${endpoint}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...this.getAuthHeaders(),
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          yield JSON.parse(line.slice(6))
        }
      }
    }
  }

  subscribe<T>(_channel: string, _callback: (data: T) => void): Subscription {
    console.warn("HTTP adapter does not support subscriptions")
    return { unsubscribe: () => {} }
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.config?.authentication) return {}

    const auth = this.config.authentication
    switch (auth.type) {
      case "bearer":
        return { Authorization: `Bearer ${auth.token}` }
      case "basic":
        return {
          Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}`,
        }
      case "api-key":
        return { "X-API-Key": auth.apiKey || "" }
      default:
        return {}
    }
  }
}
