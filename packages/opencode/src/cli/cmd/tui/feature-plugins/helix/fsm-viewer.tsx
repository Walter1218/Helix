import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "./trace"

type FSMState = "idle" | "planning" | "executing" | "checking" | "healing" | "distilling" | "reflecting" | "suspended" | "completed" | "failed"

interface FSMJournal {
  state: FSMState
  timestamp: number
  duration: number
  input?: string
  output?: string
  error?: string
}

interface FSMData {
  state: FSMState
  goal: string
  sessionID: string
  healAttempts: number
  reflectionAttempts: number
  journal: FSMJournal[]
}

const STATE_ORDER: FSMState[] = ["idle", "planning", "executing", "checking", "healing", "distilling", "reflecting", "completed"]
const STATE_LABELS: Record<FSMState, string> = {
  idle: "Idle", planning: "Planning", executing: "Executing", checking: "Checking",
  healing: "Healing", distilling: "Distilling", reflecting: "Reflecting",
  suspended: "Suspended", completed: "Completed", failed: "Failed",
}

function stateColor(state: FSMState, c: any): any {
  switch (state) {
    case "completed": return c.success
    case "failed": return c.error
    case "healing": case "reflecting": return c.warning
    case "suspended": return c.textMuted
    default: return c.primary
  }
}

export function FSMViewerRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current

  const [fsm, setFsm] = createSignal<FSMData>({
    state: "idle",
    goal: "",
    sessionID: "",
    healAttempts: 0,
    reflectionAttempts: 0,
    journal: [],
  })

  const [selectedSession, setSelectedSession] = createSignal("")

  const loadFSM = (sessionID: string) => {
    setSelectedSession(sessionID)
    trace.emit("fsm.view", "info", `FSM viewer: loading session ${sessionID}`)
    // In future: fetch FSM state from backend API
    // For now, show the FSM diagram with incoming events
  }

  onMount(() => {
    trace.emit("fsm.view", "info", "FSM viewer route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }
    const cleanups: (() => void)[] = []

    const off1 = events.on("fsm.status", (payload) => {
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      setFsm((prev) => ({
        ...prev,
        state: (evt.state as FSMState) ?? prev.state,
        sessionID: String(evt.session_id ?? prev.sessionID),
        goal: String(evt.goal ?? prev.goal),
        healAttempts: typeof evt.heal_attempts === "number" ? evt.heal_attempts : prev.healAttempts,
        reflectionAttempts: typeof evt.reflection_attempts === "number" ? evt.reflection_attempts : prev.reflectionAttempts,
        journal: Array.isArray(evt.journal) ? evt.journal.slice(-5).reverse() as FSMJournal[] : prev.journal,
      }))
    })
    cleanups.push(off1)

    onCleanup(() => cleanups.forEach((fn) => fn()))
  })

  const s = fsm()
  const currentIdx = STATE_ORDER.indexOf(s.state)
  const journalLast = s.journal.length > 0 ? s.journal.slice(0, 5) : []

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <text fg={c.primary}>
        <b>FSM State Viewer</b>
      </text>
      <box height={1} />

      {s.sessionID ? (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Session:</text>
          <text fg={c.text}>{s.sessionID}</text>
        </box>
      ) : null}
      {s.goal ? (
        <box flexDirection="row" gap={2}>
          <text fg={c.textMuted}>Goal:</text>
          <text fg={c.text} wrapMode="word">{s.goal}</text>
        </box>
      ) : null}
      <box height={1} />

      <text fg={c.text}>
        <b>State Machine</b>
      </text>
      <box height={1} />

      <box flexDirection="row" gap={1} flexWrap="wrap">
        {STATE_ORDER.map((state, idx) => {
          const done = idx < currentIdx
          const isCurrent = idx === currentIdx
          const pending = idx > currentIdx

          let icon: string
          let fg
          if (done) { icon = "✓"; fg = c.success }
          else if (isCurrent) { icon = "●"; fg = stateColor(state, c) }
          else { icon = "○"; fg = c.textMuted }

          return [
            idx > 0 ? <text fg={c.textMuted}>{pending ? "──" : "──"}</text> : null,
            <box flexDirection="column" gap={0}>
              <text fg={fg}><b>{icon} {STATE_LABELS[state]}</b></text>
              {isCurrent && state === "healing" ? (
                <text fg={c.warning}>  retry: {s.healAttempts}/{3}</text>
              ) : null}
              {isCurrent && state === "reflecting" ? (
                <text fg={c.warning}>  attempt: {s.reflectionAttempts}/{3}</text>
              ) : null}
            </box>,
          ]
        })}
      </box>

      {/* Side branches */}
      {currentIdx >= STATE_ORDER.indexOf("checking") && currentIdx < STATE_ORDER.indexOf("completed") ? (
        <box flexDirection="row" gap={1} paddingLeft={6}>
          <text fg={c.textMuted}>├─ </text>
          <text fg={s.state === "healing" ? c.warning : c.textMuted}>
            healing ({s.healAttempts}/{3})
          </text>
          <text fg={c.textMuted}> │ </text>
          <text fg={s.state === "suspended" ? c.warning : c.textMuted}>
            suspended
          </text>
          <text fg={c.textMuted}> │ </text>
          <text fg={s.state === "failed" ? c.error : c.textMuted}>
            failed
          </text>
        </box>
      ) : null}
      <box height={1} />

      <text fg={c.text}>
        <b>Journal</b>
      </text>
      <box height={1} />

      {journalLast.length > 0 ? (
        journalLast.map((entry) => (
          <box flexDirection="row" gap={2}>
            <text fg={c.textMuted}>{new Date(entry.timestamp).toLocaleTimeString()}</text>
            <text fg={stateColor(entry.state, c)}>{STATE_LABELS[entry.state]}</text>
            <text fg={c.textMuted}>duration: {entry.duration}s</text>
            {entry.error ? <text fg={c.error}>{entry.error}</text> : null}
          </box>
        ))
      ) : (
        <text fg={c.textMuted}>No journal entries yet. FSM events will appear here.</text>
      )}
      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={c.primary} onMouseDown={() => {
          _props.api.ui.toast({ variant: "info", message: "Suspend session via /suspend command", duration: 3000 })
        }}>
          [Suspend]
        </text>
        <text fg={c.error} onMouseDown={() => {
          _props.api.ui.toast({ variant: "info", message: "Abort session via /abort command", duration: 3000 })
        }}>
          [Abort]
        </text>
      </box>

      <box flexGrow={1} />
      <text fg={c.textMuted}>FSM — idle → plan → execute → check → heal → distill → complete</text>
      <text fg={c.textMuted}>Select a running session to view its state machine</text>
    </box>
  )
}
