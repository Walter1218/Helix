import type {
  CommunicationAdapter,
  CommunicationConfig,
  ConnectionConfig,
  ConnectionStatus,
  Subscription,
} from "./types"
import { HttpAdapter } from "./http-adapter"
import { WebSocketAdapter } from "./websocket-adapter"
import * as trace from "../trace"

export class GrpcAdapter implements CommunicationAdapter {
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
    const start = Date.now()
    const response = await fetch(`${this.config.endpoint}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    this._latency = Date.now() - start
    return response.json()
  }

  async *stream<T>(endpoint: string, data?: unknown): AsyncGenerator<T> {
    if (!this.config) throw new Error("Not connected")
    const response = await fetch(`${this.config.endpoint}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
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
    return { unsubscribe: () => {} }
  }
}

export class CommunicationManager {
  private adapters: Map<string, CommunicationAdapter> = new Map()
  private defaultAdapter: CommunicationAdapter | null = null

  async initialize(config: CommunicationConfig): Promise<void> {
    trace.emit("sdk.initializing", "info", "Communication manager initializing", { adapters: Object.keys(config.adapters) })
    for (const [name, adapterConfig] of Object.entries(config.adapters)) {
      const adapter = this.createAdapter(adapterConfig)
      await adapter.connect(adapterConfig)
      this.adapters.set(name, adapter)
    }
    this.defaultAdapter = this.adapters.get(config.default) || null
    trace.emit("sdk.initialized", "info", "Communication manager initialized", { default: config.default })
  }

  private createAdapter(config: ConnectionConfig): CommunicationAdapter {
    switch (config.protocol) {
      case "http":
        return new HttpAdapter()
      case "websocket":
        return new WebSocketAdapter()
      case "grpc":
        return new GrpcAdapter()
      default:
        throw new Error(`Unknown protocol: ${config.protocol}`)
    }
  }

  getAdapter(name?: string): CommunicationAdapter {
    if (name) {
      const adapter = this.adapters.get(name)
      if (!adapter) throw new Error(`Adapter ${name} not found`)
      return adapter
    }
    if (!this.defaultAdapter) throw new Error("No default adapter configured")
    return this.defaultAdapter
  }

  async request<T>(endpoint: string, data?: unknown, adapterName?: string): Promise<T> {
    return this.getAdapter(adapterName).request<T>(endpoint, data)
  }

  async *stream<T>(endpoint: string, data?: unknown, adapterName?: string): AsyncGenerator<T> {
    yield* this.getAdapter(adapterName).stream<T>(endpoint, data)
  }

  subscribe<T>(channel: string, callback: (data: T) => void, adapterName?: string): Subscription {
    return this.getAdapter(adapterName).subscribe(channel, callback)
  }

  getStatus(): Record<string, ConnectionStatus> {
    const status: Record<string, ConnectionStatus> = {}
    for (const [name, adapter] of this.adapters) {
      status[name] = adapter.status
    }
    return status
  }

  async disconnectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.disconnect()
    }
  }
}
