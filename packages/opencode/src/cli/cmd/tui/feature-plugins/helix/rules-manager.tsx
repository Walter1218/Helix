import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onMount } from "solid-js"
import * as trace from "./trace"

interface Rule {
  id: string
  text: string
  active: boolean
  source: string
  added: string
}

export function RulesManagerRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current
  const [rules, setRules] = createSignal<Rule[]>([])
  const [optimizing, setOptimizing] = createSignal(false)

  const triggerOptimize = async () => {
    setOptimizing(true)
    trace.emit("rules.optimize", "info", "DSPy optimize triggered from rules manager")
    try {
      await _props.api.ui.toast({ variant: "info", title: "DSPy Optimizer", message: "Running prompt optimizer...", duration: 3000 })
    } finally {
      setTimeout(() => setOptimizing(false), 2000)
    }
  }

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    )
    trace.emit("rules.toggle", "info", `Rule ${id} toggled`)
  }

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
    trace.emit("rules.toggle", "info", `Rule ${id} deleted`)
  }

  onMount(() => {
    trace.emit("rules.view", "info", "Rules manager route mounted")
    _props.api.ui.toast({ variant: "info", message: "Rules manager ready. Optimize to extract rules.", duration: 3000 })
  })

  const activeRules = rules().filter((r) => r.active)
  const inactiveRules = rules().filter((r) => !r.active)

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Rule Manager (DSPy Optimizer)</b>
        </text>
        <text fg={c.primary} onMouseDown={triggerOptimize}>
          {optimizing() ? "[Optimizing...]" : "[Run Optimizer]"}
        </text>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Active Rules ({activeRules.length})</b>
      </text>
      <text fg={c.textMuted}>Rules currently applied to AGENTS.md</text>
      <box height={1} />

      {activeRules.length > 0 ? (
        activeRules.map((r) => (
          <box flexDirection="row" gap={1} justifyContent="space-between">
            <box flexDirection="column" gap={0} flexGrow={1}>
              <box flexDirection="row" gap={1}>
                <text fg={c.success}>●</text>
                <text fg={c.text} wrapMode="word">{r.text}</text>
              </box>
              <text fg={c.textMuted}>  Source: {r.source} | Added: {r.added}</text>
            </box>
            <box flexDirection="row" gap={1}>
              <text fg={c.warning} onMouseDown={() => toggleRule(r.id)}>[Deactivate]</text>
              <text fg={c.error} onMouseDown={() => deleteRule(r.id)}>[Delete]</text>
            </box>
          </box>
        ))
      ) : (
        <text fg={c.textMuted}>No active rules. Run the optimizer to extract rules from failed traces.</text>
      )}
      <box height={1} />

      {inactiveRules.length > 0 ? (
        <>
          <text fg={c.text}>
            <b>Inactive Rules ({inactiveRules.length})</b>
          </text>
          <box height={1} />
          {inactiveRules.map((r) => (
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <text fg={c.textMuted}>○</text>
                <text fg={c.textMuted} wrapMode="word">{r.text}</text>
              </box>
              <box flexDirection="row" gap={1}>
                <text fg={c.success} onMouseDown={() => toggleRule(r.id)}>[Activate]</text>
                <text fg={c.error} onMouseDown={() => deleteRule(r.id)}>[Delete]</text>
              </box>
            </box>
          ))}
          <box height={1} />
        </>
      ) : null}

      <box flexGrow={1} />
      <text fg={c.textMuted}>DSPy Optimizer — Analyse failures → Extract rules → Inject into AGENTS.md</text>
      <text fg={c.textMuted}>Use /evolution for overview | /monitor for guard metrics</text>
    </box>
  )
}
