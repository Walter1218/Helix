export interface PluginMetadata {
  id: string
  name: string
  version: string
  description: string
  author: string
  dependencies?: string[]
  permissions?: Permission[]
}

export type Permission =
  | "network"
  | "filesystem"
  | "system"
  | "voice"
  | "clipboard"

export interface PluginContext {
  communication: any
  theme: any
  voice: any
  ui: any
  config: any
  events: any
}

export interface HelixPlugin {
  metadata: PluginMetadata
  onInit?(context: PluginContext): Promise<void>
  onActivate?(): Promise<void>
  onDeactivate?(): Promise<void>
  onDestroy?(): Promise<void>
  routes?: any[]
  components?: any[]
}

export interface LoadedPlugin {
  plugin: HelixPlugin
  context: PluginContext
  active: boolean
  path: string
}
