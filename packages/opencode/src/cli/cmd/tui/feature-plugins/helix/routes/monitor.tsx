import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "../trace"

function MetricCard(props: {
  title: string
  value: string | number
  subtitle?: string
  fg?: string
}) {
  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={0}>
      <text fg={props.fg ?? "#00ffcc"}>
        <b>{props.value}</b>
      </text>
      <text fg={props.fg ?? "#00ffcc"}>{props.title}</text>
      {props.subtitle && <text fg="#666666">{props.subtitle}</text>}
    </box>
  )
}

function MiniGauge(props: {
  label: string
  value: number
  max: number
  unit: string
  fg: string
}) {
  const pct = () => Math.min(100, Math.max(0, (props.value / props.max) * 100))
  const w = () => Math.round((pct() / 100) * 30)

  return (
    <box flexDirection="row" gap={1} height={1}>
      <text width={10}>{props.label}</text>
      <text fg={props.fg}>{"█".repeat(w())}</text>
      <text fg={props.fg}>
        {props.value}
        {props.unit}
      </text>
    </box>
  )
}

export function MonitorRoute(_props: { api: TuiPluginApi }) {
  const [cpu, setCpu] = createSignal(0)
  const [memory, setMemory] = createSignal(0)
  const [sessions, setSessions] = createSignal(0)
  const [judgePass, setJudgePass] = createSignal(0)
  const [judgeFail, setJudgeFail] = createSignal(0)
  const [cardinalBlock, setCardinalBlock] = createSignal(0)
  const [cardinalPause, setCardinalPause] = createSignal(0)
  const [cardinalWarn, setCardinalWarn] = createSignal(0)
  const [alignmentDrifts, setAlignmentDrifts] = createSignal(0)
  const [taskCompleted, setTaskCompleted] = createSignal(0)

  let interval: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    trace.emit("ui.render", "info", "Monitor route mounted")

    interval = setInterval(() => {
      const usage = process.cpuUsage?.() ?? { user: 0, system: 0 }
      const mem = process.memoryUsage?.() ?? { heapUsed: 0, heapTotal: 1 }
      setCpu(Math.round(((usage.user + usage.system) / 1000000 / 60) * 100))
      setMemory(Math.round((mem.heapUsed / mem.heapTotal) * 100))
    }, 2000)

    const state = _props.api.state
    setSessions(state.session.count())

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }

    events.on("judge.verdict", (payload) => {
      if (!payload || typeof payload !== "object") return
      const evt = (payload as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}
      if (evt.status === "pass") setJudgePass((n) => n + 1)
      else setJudgeFail((n) => n + 1)
    })

    events.on("cardinal.detected", (payload) => {
      if (!payload || typeof payload !== "object") return
      const evt = (payload as Record<string, unknown>)?.properties as Record<string, unknown> ?? {}
      const sev = String(evt.severity ?? "")
      if (sev === "block") setCardinalBlock((n) => n + 1)
      else if (sev === "pause" || sev === "stop") setCardinalPause((n) => n + 1)
      else setCardinalWarn((n) => n + 1)
    })

    events.on("alignment.drift", () => {
      setAlignmentDrifts((n) => n + 1)
    })
  })

  onCleanup(() => {
    if (interval) clearInterval(interval)
  })

  const c = _props.api.theme.current

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <text fg={c.primary}>
        <b>Helix System Monitor</b>
      </text>
      <box height={1} />

      <text fg={c.text}>
        <b>Process</b>
      </text>
      <MiniGauge label="CPU" value={cpu()} max={100} unit="%" fg={cpu() > 80 ? "#ff4444" : "#00ffcc"} />
      <MiniGauge label="Memory" value={memory()} max={100} unit="%" fg={memory() > 80 ? "#ff4444" : "#ffcc00"} />
      <box height={1} />

      <text fg={c.text}>
        <b>Activity</b>
      </text>
      <box flexDirection="row" gap={2}>
        <MetricCard title="Sessions" value={sessions()} fg={String(c.primary)} />
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Helix AI Guard — Real-time</b>
      </text>
      <box flexDirection="row" gap={2}>
        <MetricCard
          title="Judge Pass"
          value={judgePass()}
          fg={String(c.success)}
        />
        <MetricCard
          title="Judge Fail"
          value={judgeFail()}
          fg={String(c.error)}
        />
        <MetricCard
          title="Cardinal Block"
          value={cardinalBlock()}
          fg={String(c.error)}
        />
        <MetricCard
          title="Cardinal Pause"
          value={cardinalPause()}
          fg={String(c.warning)}
        />
        <MetricCard
          title="Cardinal Warn"
          value={cardinalWarn()}
          fg={String(c.textMuted)}
        />
        <MetricCard
          title="Align Drift"
          value={alignmentDrifts()}
          fg={String(c.warning)}
        />
      </box>
      <box height={1} />

      <text fg={c.text}>
        <b>Evolution Status</b>
      </text>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Flywheel: </text>
        <text fg={c.primary}>monitoring...</text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Tasks Today: </text>
        <text fg={c.text}>{taskCompleted()}</text>
      </box>

      <box flexGrow={1} />
      <text fg={c.textMuted}>
        Helix AI — Judge / Cardinal / AlignmentGuard / BM25+Vector RAG / Evolution Flywheel
      </text>
    </box>
  )
}
