import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "./trace"

interface DreamState {
  enabled: boolean
  lastRun: string
  nextRun: string
  intervalDays: number
  lastResult: string
  sessionID: string
}

export function DreamDistillRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current

  const [dream, setDream] = createSignal<DreamState>({
    enabled: true,
    lastRun: "",
    nextRun: "",
    intervalDays: 7,
    lastResult: "",
    sessionID: "",
  })

  const [distill, setDistill] = createSignal<DreamState>({
    enabled: true,
    lastRun: "",
    nextRun: "",
    intervalDays: 30,
    lastResult: "",
    sessionID: "",
  })

  const [dreamRunning, setDreamRunning] = createSignal(false)
  const [distillRunning, setDistillRunning] = createSignal(false)

  const triggerDream = async () => {
    setDreamRunning(true)
    trace.emit("dream.trigger", "info", "Manual dream triggered from TUI")
    try {
      await _props.api.ui.toast({
        variant: "info",
        title: "Auto Dream",
        message: "Starting memory consolidation... (session will appear as 'Auto Dream')",
        duration: 5000,
      })
    } finally {
      setTimeout(() => setDreamRunning(false), 3000)
    }
  }

  const triggerDistill = async () => {
    setDistillRunning(true)
    trace.emit("distill.trigger", "info", "Manual distill triggered from TUI")
    try {
      await _props.api.ui.toast({
        variant: "info",
        title: "Auto Distill",
        message: "Starting workflow packaging... (session will appear as 'Auto Distill')",
        duration: 5000,
      })
    } finally {
      setTimeout(() => setDistillRunning(false), 3000)
    }
  }

  const toggleDreamAuto = () => {
    const next = !dream().enabled
    setDream((p) => ({ ...p, enabled: next }))
    _props.api.kv.set("dream_auto", next)
    trace.emit("dream.config", "info", `Dream auto ${next ? "enabled" : "disabled"}`)
    _props.api.ui.toast({
      variant: "info",
      message: `Auto Dream ${next ? "enabled" : "disabled"}`,
      duration: 2000,
    })
  }

  const toggleDistillAuto = () => {
    const next = !distill().enabled
    setDistill((p) => ({ ...p, enabled: next }))
    _props.api.kv.set("distill_auto", next)
    trace.emit("distill.config", "info", `Distill auto ${next ? "enabled" : "disabled"}`)
    _props.api.ui.toast({
      variant: "info",
      message: `Auto Distill ${next ? "enabled" : "disabled"}`,
      duration: 2000,
    })
  }

  onMount(() => {
    const kv = _props.api.kv
    setDream((p) => ({ ...p, enabled: kv.get("dream_auto", true) as boolean }))
    setDistill((p) => ({ ...p, enabled: kv.get("distill_auto", true) as boolean }))
    trace.emit("ui.render", "info", "Dream/Distill route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }
    const cleanup: (() => void)[] = []

    const off1 = events.on("dream.status", (payload) => {
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      setDream((p) => ({
        ...p,
        lastRun: String(evt.last_run ?? p.lastRun),
        nextRun: String(evt.next_run ?? p.nextRun),
        lastResult: String(evt.result ?? p.lastResult),
        sessionID: String(evt.session_id ?? p.sessionID),
      }))
    })
    cleanup.push(off1)

    const off2 = events.on("distill.status", (payload) => {
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      setDistill((p) => ({
        ...p,
        lastRun: String(evt.last_run ?? p.lastRun),
        nextRun: String(evt.next_run ?? p.nextRun),
        lastResult: String(evt.result ?? p.lastResult),
        sessionID: String(evt.session_id ?? p.sessionID),
      }))
    })
    cleanup.push(off2)

    onCleanup(() => cleanup.forEach((fn) => fn()))
  })

  const d = dream()
  const di = distill()
  const daysAgo = (lastRun: string) => {
    if (!lastRun) return ""
    const then = new Date(lastRun).getTime()
    const days = Math.round((Date.now() - then) / (24 * 60 * 60 * 1000))
    return ` (${days} days ago)`
  }

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <text fg={c.primary}>
        <b>Helix Dream & Distill</b>
      </text>
      <box height={1} />

      <text fg={c.text}>
        <b>Auto Dream (Memory Consolidation)</b>
      </text>
      <text fg={c.textMuted}>Analyzes trajectories and consolidates durable knowledge into project memory.</text>
      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Status:</text>
        <text fg={d.enabled ? c.success : c.textMuted}>● {d.enabled ? "Active" : "Inactive"}</text>
      </box>
      {d.lastRun ? (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last Run:</text>
          <text fg={c.text}>{d.lastRun}{daysAgo(d.lastRun)}</text>
        </box>
      ) : (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last Run:</text>
          <text fg={c.textMuted}>never</text>
        </box>
      )}
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Interval:</text>
        <text fg={c.text}>Every {d.intervalDays} days</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Auto:</text>
        <text fg={d.enabled ? c.success : c.error} onMouseDown={toggleDreamAuto}>
          [{d.enabled ? "● ON" : "○ OFF"}] Toggle
        </text>
      </box>
      {d.lastResult ? (
        <text fg={c.text} wrapMode="word">
          Last: {d.lastResult}
        </text>
      ) : null}
      <box height={1} />
      <box flexDirection="row" gap={2}>
        <text fg={c.primary} onMouseDown={triggerDream}>
          [{dreamRunning() ? "Running..." : "Run Dream Now"}]
        </text>
        <text fg={c.textMuted}>or use /dream command</text>
      </box>
      <box height={1} />

      <box height={1} />
      <text fg={c.textMuted}>──────────────────────────────────────────────────</text>
      <box height={1} />

      <text fg={c.text}>
        <b>Auto Distill (Workflow Packaging)</b>
      </text>
      <text fg={c.textMuted}>Identifies repeated manual workflows and creates reusable skills/subagents/commands.</text>
      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Status:</text>
        <text fg={di.enabled ? c.success : c.textMuted}>● {di.enabled ? "Active" : "Inactive"}</text>
      </box>
      {di.lastRun ? (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last Run:</text>
          <text fg={c.text}>{di.lastRun}{daysAgo(di.lastRun)}</text>
        </box>
      ) : (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last Run:</text>
          <text fg={c.textMuted}>never</text>
        </box>
      )}
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Interval:</text>
        <text fg={c.text}>Every {di.intervalDays} days</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Auto:</text>
        <text fg={di.enabled ? c.success : c.error} onMouseDown={toggleDistillAuto}>
          [{di.enabled ? "● ON" : "○ OFF"}] Toggle
        </text>
      </box>
      {di.lastResult ? (
        <text fg={c.text} wrapMode="word">
          Last: {di.lastResult}
        </text>
      ) : null}
      <box height={1} />
      <box flexDirection="row" gap={2}>
        <text fg={c.primary} onMouseDown={triggerDistill}>
          [{distillRunning() ? "Running..." : "Run Distill Now"}]
        </text>
        <text fg={c.textMuted}>or use /distill command</text>
      </box>

      <box flexGrow={1} />
      <text fg={c.textMuted}>Dream/Distill — Consolidate knowledge → Package workflows → Evolve the project</text>
      <text fg={c.textMuted}>Use /evolution for flywheel | /monitor for guard metrics</text>
    </box>
  )
}
