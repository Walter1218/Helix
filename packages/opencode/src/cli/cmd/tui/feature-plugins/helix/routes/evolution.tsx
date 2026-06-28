import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "../trace"

interface EvolutionState {
  phase: string
  traces_passed: number
  traces_failed: number
  dpo_exports: number
  optimizations: number
  nextSchedule: string
  lastRun: string
  judgePassRate: number
  cardinalBlockRate: number
}

function progressBar(width: number, pct: number, fg: string, bg: string): string {
  const filled = Math.round((pct / 100) * width)
  const empty = width - filled
  return "█".repeat(filled) + "░".repeat(empty)
}

function phaseIcon(phase: string, target: string): string {
  if (phase === target) return "●"
  const order = ["testing", "exporting", "optimizing", "done"]
  return order.indexOf(target) < order.indexOf(phase) ? "✓" : "○"
}

export function EvolutionRoute(_props: { api: TuiPluginApi }) {
  const [state, setState] = createSignal<EvolutionState>({
    phase: "idle",
    traces_passed: 0,
    traces_failed: 0,
    dpo_exports: 0,
    optimizations: 0,
    nextSchedule: "daily 11:50",
    lastRun: "",
    judgePassRate: 0,
    cardinalBlockRate: 0,
  })
  const [exporting, setExporting] = createSignal(false)
  const [optimizing, setOptimizing] = createSignal(false)
  const [running, setRunning] = createSignal(false)

  const c = _props.api.theme.current

  let judgeTotal = 0
  let judgePass = 0
  let cardinalTotal = 0
  let cardinalBlock = 0

  const triggerExport = async () => {
    setExporting(true)
    trace.emit("evolution.export", "info", "DPO export triggered from TUI")
    try {
      const api = _props.api
      await api.ui.toast({ variant: "info", title: "DPO Export", message: "Starting DPO dataset export...", duration: 3000 })
    } finally {
      setTimeout(() => setExporting(false), 2000)
    }
  }

  const triggerOptimize = async () => {
    setOptimizing(true)
    trace.emit("evolution.optimize", "info", "DSPy optimize triggered from TUI")
    try {
      const api = _props.api
      await api.ui.toast({ variant: "info", title: "DSPy Optimizer", message: "Running DSPy prompt optimizer...", duration: 3000 })
    } finally {
      setTimeout(() => setOptimizing(false), 2000)
    }
  }

  const triggerFlywheel = async () => {
    setRunning(true)
    trace.emit("evolution.flywheel", "info", "Flywheel run triggered from TUI")
    try {
      const api = _props.api
      await api.ui.toast({ variant: "info", title: "Evolution Flywheel", message: "Starting full evolution cycle...", duration: 5000 })
    } finally {
      setTimeout(() => setRunning(false), 3000)
    }
  }

  onMount(() => {
    trace.emit("ui.render", "info", "Evolution route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }

    const off1 = events.on("evolution.status", (payload) => {
      if (!payload || typeof payload !== "object") return
      const evt = (payload as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}
      setState((prev) => ({
        ...prev,
        phase: String(evt.phase ?? prev.phase),
        traces_passed: typeof evt.traces_passed === "number" ? evt.traces_passed : prev.traces_passed,
        traces_failed: typeof evt.traces_failed === "number" ? evt.traces_failed : prev.traces_failed,
        dpo_exports: typeof evt.dpo_exports === "number" ? evt.dpo_exports : prev.dpo_exports,
        optimizations: typeof evt.optimizations === "number" ? evt.optimizations : prev.optimizations,
        nextSchedule: String(evt.next_schedule ?? prev.nextSchedule),
        lastRun: String(evt.last_run ?? prev.lastRun),
      }))
    })

    const off2 = events.on("judge.verdict", (payload) => {
      judgeTotal++
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      if (evt.status === "pass") judgePass++
      setState((prev) => ({ ...prev, judgePassRate: judgeTotal > 0 ? Math.round((judgePass / judgeTotal) * 100) : 0 }))
    })

    const off3 = events.on("cardinal.detected", (payload) => {
      cardinalTotal++
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      if (evt.severity === "block") cardinalBlock++
      setState((prev) => ({
        ...prev,
        cardinalBlockRate: cardinalTotal > 0 ? Math.round((cardinalBlock / cardinalTotal) * 100) : 0,
      }))
    })

    onCleanup(() => {
      off1()
      off2()
      off3()
    })
  })

  const s = state()
  const traceRate = s.traces_passed + s.traces_failed > 0
    ? Math.round((s.traces_passed / (s.traces_passed + s.traces_failed)) * 100)
    : 0

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Helix Evolution Flywheel</b>
        </text>
        <box flexDirection="row" gap={2}>
          <text fg={c.primary} onMouseDown={triggerFlywheel}>
            {running() ? "[ Running... ]" : "[ Run Flywheel ]"}
          </text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Pipeline</b>
      </text>
      <box flexDirection="row" gap={1}>
        <text fg={s.phase === "testing" ? c.primary : s.phase === "done" || s.phase === "exporting" || s.phase === "optimizing" ? c.success : c.textMuted}>
          {phaseIcon(s.phase, "testing")} Test
        </text>
        <text fg={c.textMuted}> ── </text>
        <text fg={s.phase === "exporting" ? c.primary : s.phase === "done" || s.phase === "optimizing" ? c.success : c.textMuted}>
          {phaseIcon(s.phase, "exporting")} Export DPO
        </text>
        <text fg={c.textMuted}> ── </text>
        <text fg={s.phase === "optimizing" ? c.primary : s.phase === "done" ? c.success : c.textMuted}>
          {phaseIcon(s.phase, "optimizing")} Optimize
        </text>
        <text fg={c.textMuted}> ── </text>
        <text fg={s.phase === "done" ? c.success : c.textMuted}>
          {phaseIcon(s.phase, "done")} Report
        </text>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Traces</b>
      </text>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Passed:</text>
          <text fg={c.success}><b>{s.traces_passed}</b></text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Failed:</text>
          <text fg={c.error}><b>{s.traces_failed}</b></text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Rate:</text>
          <text fg={traceRate >= 70 ? c.success : c.warning}>{traceRate}%</text>
        </box>
      </box>
      <text fg={c.success}>{progressBar(30, traceRate, "", "")}</text>
      <box height={1} />

      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.text}>
          <b>DPO Exports</b>
        </text>
        <text fg={c.primary} onMouseDown={triggerExport}>
          {exporting() ? "[ Exporting... ]" : "[ Export DPO Dataset ]"}
        </text>
      </box>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Exports:</text>
          <text fg={c.primary}><b>{s.dpo_exports}</b></text>
        </box>
      </box>
      <box height={1} />

      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.text}>
          <b>Optimizer</b>
        </text>
        <text fg={c.primary} onMouseDown={triggerOptimize}>
          {optimizing() ? "[ Optimizing... ]" : "[ Run DSPy Optimizer ]"}
        </text>
      </box>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Optimizations:</text>
          <text fg={c.primary}><b>{s.optimizations}</b></text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Guard Metrics</b>
      </text>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Judge Pass:</text>
          <text fg={s.judgePassRate >= 70 ? c.success : c.warning}><b>{s.judgePassRate}%</b></text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Cardinal Block:</text>
          <text fg={s.cardinalBlockRate > 10 ? c.error : c.textMuted}><b>{s.cardinalBlockRate}%</b></text>
        </box>
      </box>
      <text fg={s.judgePassRate >= 70 ? c.success : c.warning}>{progressBar(40, s.judgePassRate, "", "")}</text>
      <box height={1} />

      <text fg={c.text}>
        <b>Schedule</b>
      </text>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Next:</text>
        <text fg={c.text}>{s.nextSchedule || "not scheduled"}</text>
      </box>
      {s.lastRun ? (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last:</text>
          <text fg={c.text}>{s.lastRun}</text>
        </box>
      ) : null}
      <box height={1} />

      <box flexGrow={1} />
      <text fg={c.textMuted}>Evolution Flywheel — Test → Export DPO → Optimize Prompt → Repeat</text>
      <text fg={c.textMuted}>Use /monitor for guard metrics | /project for roadmap | /dream for memory</text>
    </box>
  )
}
