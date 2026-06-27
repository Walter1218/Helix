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

  const c = _props.api.theme.current

  let judgeTotal = 0
  let judgePass = 0
  let cardinalTotal = 0
  let cardinalBlock = 0

  onMount(() => {
    trace.emit("ui.render", "info", "Evolution route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }

    const off1 = events.on("evolution.status", (payload) => {
      if (!payload || typeof payload !== "object") return
      const evt = payload as Record<string, unknown>
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
      if (payload && typeof payload === "object" && (payload as Record<string, unknown>).status === "pass")
        judgePass++
      setState((prev) => ({ ...prev, judgePassRate: judgeTotal > 0 ? Math.round((judgePass / judgeTotal) * 100) : 0 }))
    })

    const off3 = events.on("cardinal.detected", (payload) => {
      cardinalTotal++
      if (payload && typeof payload === "object" && (payload as Record<string, unknown>).severity === "block")
        cardinalBlock++
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

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <text fg={c.primary}>
        <b>Helix Evolution Flywheel</b>
      </text>
      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Phase: </text>
        <text fg={s.phase === "running" ? c.primary : c.textMuted}>
          <b>{s.phase}</b>
        </text>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Traces</b>
      </text>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Passed: </text>
          <text fg={c.success}>
            <b>{s.traces_passed}</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Failed: </text>
          <text fg={c.error}>
            <b>{s.traces_failed}</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Rate: </text>
          <text fg={c.success}>
            {s.traces_passed + s.traces_failed > 0
              ? Math.round((s.traces_passed / (s.traces_passed + s.traces_failed)) * 100)
              : 0}
            %
          </text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>DPO & Optimization</b>
      </text>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Exports: </text>
          <text fg={c.primary}>
            <b>{s.dpo_exports}</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Optimizations: </text>
          <text fg={c.primary}>
            <b>{s.optimizations}</b>
          </text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Guard Metrics</b>
      </text>
      <box flexDirection="row" gap={4}>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Judge Pass Rate: </text>
          <text fg={s.judgePassRate >= 70 ? c.success : c.warning}>
            <b>{s.judgePassRate}%</b>
          </text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={c.textMuted}>Cardinal Block Rate: </text>
          <text fg={s.cardinalBlockRate > 10 ? c.error : c.textMuted}>
            <b>{s.cardinalBlockRate}%</b>
          </text>
        </box>
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Schedule</b>
      </text>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Next: </text>
        <text fg={c.text}>{s.nextSchedule || "not scheduled"}</text>
      </box>
      {s.lastRun && (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Last: </text>
          <text fg={c.text}>{s.lastRun}</text>
        </box>
      )}
      <box height={1} />

      <text fg={c.text}>
        <b>Pipeline</b>
      </text>
      <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={2}>
          <text fg={s.phase === "testing" ? c.primary : c.textMuted}>1. Test Cases</text>
          <text fg={c.textMuted}>→</text>
          <text fg={s.phase === "exporting" ? c.primary : c.textMuted}>2. DPO Export</text>
          <text fg={c.textMuted}>→</text>
          <text fg={s.phase === "optimizing" ? c.primary : c.textMuted}>3. Optimize</text>
          <text fg={c.textMuted}>→</text>
          <text fg={s.phase === "done" ? c.success : c.textMuted}>4. Report</text>
        </box>
      </box>

      <box flexGrow={1} />
      <text fg={c.textMuted}>Evolution Flywheel — Test → Export DPO → Optimize Prompt → Repeat (via launchd cron)</text>
      <text fg={c.textMuted}>Use /monitor to view real-time guard metrics | /project to view roadmap</text>
    </box>
  )
}
