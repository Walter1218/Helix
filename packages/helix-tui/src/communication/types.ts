export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface ConnectionConfig {
  protocol: "http" | "websocket" | "grpc"
  endpoint: string
  authentication?: AuthConfig
  options?: ConnectionOptions
}

export interface AuthConfig {
  type: "bearer" | "basic" | "api-key"
  token?: string
  username?: string
  password?: string
  apiKey?: string
}

export interface ConnectionOptions {
  timeout?: number
  reconnect?: boolean
  maxRetries?: number
}

export interface Subscription {
  unsubscribe: () => void
}

export interface CommunicationAdapter {
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  request<T>(endpoint: string, data?: unknown): Promise<T>
  stream<T>(endpoint: string, data?: unknown): AsyncGenerator<T>
  subscribe<T>(channel: string, callback: (data: T) => void): Subscription
  readonly status: ConnectionStatus
  readonly latency: number
}

export interface CommunicationConfig {
  default: string
  adapters: Record<string, ConnectionConfig>
}
