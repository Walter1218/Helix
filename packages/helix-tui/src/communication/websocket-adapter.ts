import type {
  CommunicationAdapter,
  ConnectionConfig,
  ConnectionStatus,
  Subscription,
} from "./types"

export class WebSocketAdapter implements CommunicationAdapter {
  private ws: WebSocket | null = null
  private config: ConnectionConfig | null = null
  private _status: ConnectionStatus = "disconnected"
  private _latency = 0
  private subscriptions: Map<string, Set<(data: unknown) => void>> = new Map()

  get status(): ConnectionStatus {
    return this._status
  }

  get latency(): number {
    return this._latency
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.config = config
    this._status = "connecting"

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(config.endpoint)

      this.ws.onopen = () => {
        this._status = "connected"
        resolve()
      }

      this.ws.onerror = (error) => {
        this._status = "error"
        reject(error)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const channel = data.channel
          if (channel && this.subscriptions.has(channel)) {
            this.subscriptions.get(channel)?.forEach((cb) => cb(data.payload))
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error)
        }
      }

      this.ws.onclose = () => {
        this._status = "disconnected"
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._status = "disconnected"
  }

  async request<T>(endpoint: string, data?: unknown): Promise<T> {
    if (!this.ws || this._status !== "connected") {
      throw new Error("Not connected")
    }

    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2)
      const timeout = setTimeout(() => reject(new Error("Request timeout")), 30000)

      const handler = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data)
          if (response.requestId === requestId) {
            clearTimeout(timeout)
            this.ws?.removeEventListener("message", handler)
            if (response.error) {
              reject(new Error(response.error))
            } else {
              resolve(response.data)
            }
          }
        } catch (error) {
          reject(error)
        }
      }

      this.ws?.addEventListener("message", handler)
      this.ws?.send(JSON.stringify({ requestId, endpoint, data }))
    })
  }

  async *stream<T>(endpoint: string, data?: unknown): AsyncGenerator<T> {
    if (!this.ws || this._status !== "connected") {
      throw new Error("Not connected")
    }

    const streamId = Math.random().toString(36).slice(2)
    const queue: T[] = []
    let resolve: (() => void) | null = null
    let done = false

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.streamId === streamId) {
          if (msg.done) {
            done = true
            resolve?.()
          } else {
            queue.push(msg.data)
            resolve?.()
          }
        }
      } catch (error) {
        console.error("Stream error:", error)
      }
    }

    this.ws.addEventListener("message", handler)
    this.ws.send(JSON.stringify({ streamId, endpoint, data }))

    try {
      while (!done) {
        if (queue.length === 0) {
          await new Promise<void>((r) => (resolve = r))
        }
        while (queue.length > 0) {
          yield queue.shift()!
        }
      }
    } finally {
      this.ws.removeEventListener("message", handler)
    }
  }

  subscribe<T>(channel: string, callback: (data: T) => void): Subscription {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(callback as (data: unknown) => void)

    if (this.ws && this._status === "connected") {
      this.ws.send(JSON.stringify({ type: "subscribe", channel }))
    }

    return {
      unsubscribe: () => {
        this.subscriptions.get(channel)?.delete(callback as (data: unknown) => void)
        if (this.subscriptions.get(channel)?.size === 0) {
          this.subscriptions.delete(channel)
          if (this.ws && this._status === "connected") {
            this.ws.send(JSON.stringify({ type: "unsubscribe", channel }))
          }
        }
      },
    }
  }
}
