import { createTuiPluginApi } from "@test/fixture/tui-plugin"
import type { HostPluginApi } from "@/cli/cmd/tui/plugin/slots"
import type { TuiPluginMeta } from "@mimo-ai/plugin/tui"

const TEST_META: TuiPluginMeta = {
  id: "test",
  source: "internal",
  spec: "test",
  target: "test",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "first",
}

export interface HelixEventSpy {
  on: (type: string, handler: (payload: unknown) => void) => () => void
  emit: (type: string, properties: Record<string, unknown>) => void
  handlerCount: (type: string) => number
  calls: Array<{ type: string; payload: unknown }>
}

export interface Tracker {
  dialogReplaceCalls: number
  toastCalls: Array<{ variant: string; title: string; message: string }>
  dialogComponent: unknown
}

export function createHelixEventSpy(): HelixEventSpy {
  const handlers = new Map<string, Array<(payload: unknown) => void>>()
  const calls: Array<{ type: string; payload: unknown }> = []

  return {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, [])
      handlers.get(type)!.push(handler)
      return () => {
        const list = handlers.get(type)
        if (list) {
          const idx = list.indexOf(handler)
          if (idx >= 0) list.splice(idx, 1)
        }
      }
    },
    emit(type, properties) {
      const payload = { type, properties }
      calls.push({ type, payload })
      const list = handlers.get(type)
      if (list) {
        for (const h of list) h(payload)
      }
    },
    handlerCount(type) {
      return handlers.get(type)?.length ?? 0
    },
    calls,
  }
}

export function callPlugin(
  module: { tui: (api: HostPluginApi, _options: Record<string, unknown> | undefined, _meta: TuiPluginMeta) => Promise<void> },
  api: HostPluginApi,
) {
  return module.tui(api, undefined, TEST_META)
}

export function createHelixTestHarness() {
  const eventSpy = createHelixEventSpy()
  const tracker: Tracker = {
    dialogReplaceCalls: 0,
    toastCalls: [],
    dialogComponent: undefined,
  }

  const api = createTuiPluginApi({
    state: {
      session: {
        count: () => 1,
        status: (_sid: string) => undefined,
        cwd: () => "/test",
      },
    },
    app: { version: "0.1.0-test" },
  })

  ;(api.event as any).on = eventSpy.on

  const origReplace: (...args: any[]) => void = api.ui.dialog.replace as any
  ;(api.ui.dialog as any).replace = (comp: unknown) => {
    tracker.dialogReplaceCalls++
    tracker.dialogComponent = comp
    origReplace(() => comp)
  }

  const origToast: (...args: any[]) => void = api.ui.toast as any
  ;(api.ui as any).toast = (opts: { variant: string; title: string; message: string; duration?: number }) => {
    tracker.toastCalls.push(opts)
    origToast(opts)
  }

  return { api, eventSpy, tracker }
}
