import type { SlotPlugin } from "./slots"
import { registerPlugin, unregisterPlugin } from "./slots"

export interface PluginContext {
  sdk: any
  sync: any
  theme: any
  dialog: any
  toast: any
  kv: any
  route: any
  keybind: any
}

export interface TuiPluginApi {
  app: {
    version: string
  }
  command: {
    register: (cb: () => any[]) => void
    trigger: (value: string) => void
  }
  route: {
    navigate: (name: string, params?: Record<string, unknown>) => void
    current: () => any
  }
  ui: {
    toast: (message: string, variant?: "info" | "success" | "warning" | "error") => void
    dialog: {
      replace: (element: any, onClose?: () => void) => void
      clear: () => void
      setSize: (size: "medium" | "large" | "xlarge") => void
    }
  }
  state: {
    sessions: () => any[]
    messages: (sessionID: string) => any[]
    providers: () => any[]
    agents: () => any[]
  }
  slots: {
    register: (plugin: SlotPlugin) => void
    unregister: (pluginId: string) => void
  }
  lifecycle: {
    onDispose: (fn: () => void) => void
    signal: AbortSignal
  }
}

export function createPluginApi(context: PluginContext): TuiPluginApi {
  const disposes: (() => void)[] = []
  const abort = new AbortController()

  return {
    app: {
      version: "0.1.0",
    },
    command: {
      register: (cb) => {
        // Commands will be integrated with the command palette
      },
      trigger: (value) => {
        // Command execution
      },
    },
    route: {
      navigate: (name, params) => {
        context.route?.navigate?.({ type: name as any, ...params })
      },
      current: () => context.route?.data,
    },
    ui: {
      toast: (message, variant = "info") => {
        context.toast?.show?.({ message, variant })
      },
      dialog: {
        replace: (element, onClose) => {
          context.dialog?.replace?.(element, onClose)
        },
        clear: () => {
          context.dialog?.clear?.()
        },
        setSize: (size) => {
          context.dialog?.setSize?.(size)
        },
      },
    },
    state: {
      sessions: () => context.sync?.data?.session ?? [],
      messages: (sessionID) => {
        const buckets = context.sync?.data?.message?.[sessionID]
        if (!buckets) return []
        return Object.values(buckets).flat()
      },
      providers: () => context.sync?.data?.provider ?? [],
      agents: () => context.sync?.data?.agent ?? [],
    },
    slots: {
      register: (plugin) => {
        registerPlugin(plugin)
        disposes.push(() => unregisterPlugin(plugin.id))
      },
      unregister: (pluginId) => {
        unregisterPlugin(pluginId)
      },
    },
    lifecycle: {
      onDispose: (fn) => disposes.push(fn),
      signal: abort.signal,
    },
  }
}

export function disposePlugin(disposes: (() => void)[]) {
  for (const dispose of disposes.reverse()) {
    try {
      dispose()
    } catch (e) {
      console.error("Plugin dispose error:", e)
    }
  }
}
