import { createSimpleContext } from "./helper"
import { useKV } from "./kv"

export interface Keybind {
  key: string
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  action: string
  description?: string
}

const DEFAULT_KEYBINDS: Keybind[] = [
  { key: "return", action: "submit", description: "Submit message" },
  { key: "escape", action: "abort", description: "Abort session" },
  { key: "up", action: "history-prev", description: "Previous input" },
  { key: "down", action: "history-next", description: "Next input" },
  { key: "f2", action: "cycle-model", description: "Cycle model" },
  { key: "tab", action: "cycle-mode", description: "Cycle mode" },
  { key: "t", ctrl: true, action: "toggle-thinking", description: "Toggle thinking" },
  { key: "d", ctrl: true, action: "toggle-tool-details", description: "Toggle tool details" },
  { key: ".", ctrl: true, action: "toggle-timestamps", description: "Toggle timestamps" },
  { key: "k", ctrl: true, action: "command-palette", description: "Command palette" },
  { key: "s", ctrl: true, action: "stash-prompt", description: "Stash prompt" },
  { key: "r", ctrl: true, action: "restore-prompt", description: "Restore prompt" },
  { key: "l", ctrl: true, action: "timeline", description: "Show timeline" },
]

export const { use: useKeybind, provider: KeybindProvider } = createSimpleContext({
  name: "Keybind",
  init: () => {
    const kv = useKV()

    function getAll(): Keybind[] {
      const custom: Keybind[] = kv.get("keybinds", [])
      const merged = [...DEFAULT_KEYBINDS]
      for (const kb of custom) {
        const idx = merged.findIndex((m) => m.action === kb.action)
        if (idx >= 0) merged[idx] = kb
        else merged.push(kb)
      }
      return merged
    }

    function match(
      key: string,
      evt: { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
    ): Keybind | undefined {
      const binds = getAll()
      return binds.find(
        (b) =>
          b.key === key &&
          (b.ctrl ?? false) === (evt.ctrl ?? false) &&
          (b.shift ?? false) === (evt.shift ?? false) &&
          (b.meta ?? false) === (evt.meta ?? false),
      )
    }

    function getAction(key: string, evt: { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean }): string | undefined {
      return match(key, evt)?.action
    }

    function print(kb: Keybind): string {
      const parts: string[] = []
      if (kb.ctrl) parts.push("Ctrl")
      if (kb.shift) parts.push("Shift")
      if (kb.meta) parts.push("Meta")
      parts.push(kb.key.toUpperCase())
      return parts.join("+")
    }

    function set(action: string, keybind: Omit<Keybind, "action">) {
      const custom: Keybind[] = kv.get("keybinds", [])
      const idx = custom.findIndex((k) => k.action === action)
      const entry: Keybind = { ...keybind, action }
      if (idx >= 0) custom[idx] = entry
      else custom.push(entry)
      kv.set("keybinds", custom)
    }

    function reset(action?: string) {
      if (action) {
        const custom: Keybind[] = kv.get("keybinds", [])
        kv.set(
          "keybinds",
          custom.filter((k) => k.action !== action),
        )
      } else {
        kv.set("keybinds", [])
      }
    }

    return { getAll, match, getAction, print, set, reset }
  },
})
