import { appendFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

export type TraceEventType =
  | "user.send"
  | "user.navigate"
  | "user.permission_reply"
  | "user.question_reply"
  | "user.abort"
  | "user.retry"
  | "user.input_history"
  | "session.create"
  | "session.created"
  | "session.delete"
  | "session.deleted"
  | "session.delete.error"
  | "session.rename"
  | "session.renamed"
  | "session.rename.error"
  | "session.prompt"
  | "session.prompt_response"
  | "session.error"
  | "session.idle"
  | "session.list.loaded"
  | "session.list.error"
  | "session.messages.load"
  | "session.messages.loaded"
  | "session.messages.error"
  | "session.auto_recovery"
  | "session.dialog.open"
  | "event.delta"
  | "event.permission_asked"
  | "event.question_asked"
  | "event.tool.call"
  | "sdk.connected"
  | "sdk.disconnected"
  | "sdk.reconnecting"
  | "sdk.connecting"
  | "sdk.disconnecting"
  | "sdk.error"
  | "sdk.request"
  | "sdk.initializing"
  | "sdk.initialized"
  | "ui.render"
  | "ui.init"
  | "ui.focus"
  | "ui.error"
  | "preflight.check"
  | "preflight.card"
  | "preflight.answer"
  | "preflight.confirm"
  | "preflight.skip"
  | "cardinal.detected"
  | "cardinal.card"
  | "cardinal.action"
  | "cardinal.degrade"
  | "judge.verdict"
  | "judge.card"
  | "alignment.drift"
  | "subagent.spawn"
  | "subagent.progress"
  | "subagent.complete"
  | "barrier.wait"
  | "barrier.release"
  | "mode.registry.load"
  | "mode.switch"
  | "mode.config.apply"
  | "decomposition.decision"
  | "decomposition.spawn"
  | "persona.generate"
  | "agent.stats.update"
  | "dream.trigger"
  | "dream.status"
  | "dream.config"
  | "distill.trigger"
  | "distill.status"
  | "distill.config"
  | "fsm.view"
  | "fsm.status"
  | "fsm.action"
  | "dpo.browse"
  | "dpo.export"
  | "rules.view"
  | "rules.optimize"
  | "rules.toggle"
  | "notifications.view"
  | "notifications.filter"
  | "notifications.dismiss"
  | "preflight.panel"
  | "preflight.retry"
  | "evolution.export"
  | "evolution.optimize"
  | "evolution.flywheel"

export type TraceLevel = "debug" | "info" | "warn" | "error"

export interface TraceEvent {
  id: string
  type: TraceEventType
  level: TraceLevel
  message: string
  data?: Record<string, unknown>
  timestamp: number
  sessionId?: string
}

const MAX_TRACES = 5000
const traces: TraceEvent[] = []
let logFile: string | null = null
let enabled = true
let fileLogging = true

function getLogFile(): string {
  if (!logFile) {
    const dir = join(tmpdir(), "helix-tui")
    try { mkdirSync(dir, { recursive: true }) } catch {}
    logFile = join(dir, `trace-${new Date().toISOString().slice(0, 10)}.log`)
  }
  return logFile
}

export function emit(
  type: TraceEventType,
  level: TraceLevel,
  message: string,
  data?: Record<string, unknown>,
  sessionId?: string,
) {
  if (!enabled) return

  const event: TraceEvent = {
    id: Math.random().toString(36).slice(2, 8),
    type,
    level,
    message,
    data,
    timestamp: Date.now(),
    sessionId,
  }

  traces.push(event)
  if (traces.length > MAX_TRACES) traces.splice(0, traces.length - MAX_TRACES)

  if (fileLogging && level !== "debug") {
    const line = `[${new Date(event.timestamp).toISOString()}] [${level.toUpperCase().padEnd(5)}] [${type.padEnd(24)}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`
    try {
      appendFileSync(getLogFile(), line)
    } catch {}
  }
}

export function getTraces(filter?: { type?: TraceEventType; sessionId?: string; level?: TraceLevel }): TraceEvent[] {
  let result = traces
  if (filter?.type) result = result.filter((t) => t.type === filter.type)
  if (filter?.sessionId) result = result.filter((t) => t.sessionId === filter.sessionId)
  if (filter?.level) result = result.filter((t) => t.level === filter.level)
  return result
}

export function getTraceLog(): string {
  return getLogFile()
}

export function setEnabled(v: boolean) {
  enabled = v
}

export function setFileLogging(v: boolean) {
  fileLogging = v
}

export function clear() {
  traces.length = 0
}
