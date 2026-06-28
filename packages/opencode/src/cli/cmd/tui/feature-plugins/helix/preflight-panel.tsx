import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, onCleanup, onMount } from "solid-js"
import * as trace from "./trace"

interface PreflightCheck {
  name: string
  status: "pass" | "warn" | "fail"
  message: string
}

interface PreflightResult {
  sessionID: string
  status: "passed" | "blocked" | "warning"
  checks: PreflightCheck[]
  blocked: boolean
  timestamp: string
}

const statusIcon = (status: "pass" | "warn" | "fail"): string => {
  switch (status) {
    case "pass": return "✓"
    case "warn": return "⚠"
    case "fail": return "✗"
  }
}

const statusColor = (status: "pass" | "warn" | "fail", c: any): any => {
  switch (status) {
    case "pass": return c.success
    case "warn": return c.warning
    case "fail": return c.error
  }
}

export function PreflightPanelRoute(_props: { api: TuiPluginApi }) {
  const c = _props.api.theme.current
  const [result, setResult] = createSignal<PreflightResult | null>(null)
  const [history, setHistory] = createSignal<PreflightResult[]>([])
  const [retrying, setRetrying] = createSignal(false)

  const triggerRetry = async () => {
    setRetrying(true)
    trace.emit("preflight.retry", "info", "Preflight retry triggered from panel")
    try {
      await _props.api.ui.toast({ variant: "info", title: "Pre-flight", message: "Re-running pre-flight checks...", duration: 3000 })
    } finally {
      setTimeout(() => setRetrying(false), 2000)
    }
  }

  onMount(() => {
    trace.emit("preflight.panel", "info", "Preflight panel route mounted")

    const events = _props.api.event as unknown as {
      on: (type: string, handler: (payload: unknown) => void) => () => void
    }
    const cleanups: (() => void)[] = []

    const off1 = events.on("preflight.result", (payload) => {
      const evt = ((payload as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>
      const checks = Array.isArray(evt.checks) ? evt.checks as PreflightCheck[] : []
      const r: PreflightResult = {
        sessionID: String(evt.sessionID ?? evt.session_id ?? ""),
        status: (evt.status as PreflightResult["status"]) ?? (evt.blocked ? "blocked" : "passed"),
        blocked: evt.blocked === true,
        checks,
        timestamp: new Date().toISOString(),
      }
      setResult(r)
      setHistory((prev) => [r, ...prev].slice(0, 50))
    })
    cleanups.push(off1)

    onCleanup(() => cleanups.forEach((fn) => fn()))
  })

  const r = result()
  const h = history()
  const passCount = r ? r.checks.filter((c) => c.status === "pass").length : 0
  const warnCount = r ? r.checks.filter((c) => c.status === "warn").length : 0
  const failCount = r ? r.checks.filter((c) => c.status === "fail").length : 0

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Pre-flight Check</b>
        </text>
        <box flexDirection="row" gap={2}>
          <text fg={c.primary} onMouseDown={triggerRetry}>
            {retrying() ? "[Retrying...]" : "[Retry]"}
          </text>
          {r?.blocked ? (
            <text fg={c.warning} onMouseDown={() => _props.api.ui.toast({ variant: "info", message: "Use /skip to proceed", duration: 2000 })}>
              [Skip]
            </text>
          ) : null}
        </box>
      </box>
      <box height={1} />

      {r ? (
        <>
          <box flexDirection="row" gap={2}>
            <text fg={c.textMuted}>Status:</text>
            <text fg={r.status === "passed" ? c.success : r.status === "warning" ? c.warning : c.error}>
              ● {r.status.toUpperCase()}
            </text>
          </box>
          {r.sessionID ? (
            <box flexDirection="row" gap={2}>
              <text fg={c.textMuted}>Session:</text>
              <text fg={c.text}>{r.sessionID.slice(0, 12)}</text>
            </box>
          ) : null}
          <box height={1} />

          {r.checks.map((check) => (
            <box flexDirection="row" gap={1}>
              <text fg={statusColor(check.status, c)}>{statusIcon(check.status)}</text>
              <text fg={c.text}>{check.name}</text>
              <text fg={c.textMuted}>{check.message}</text>
            </box>
          ))}
          <box height={1} />

          <box flexDirection="row" gap={2}>
            <text fg={c.textMuted}>Summary:</text>
            <text fg={c.success}>{passCount} passed</text>
            {warnCount > 0 ? <text fg={c.warning}>, {warnCount} warning</text> : null}
            {failCount > 0 ? <text fg={c.error}>, {failCount} failed</text> : null}
          </box>
          {r.blocked ? (
            <text fg={c.error}><b>Blocked: Yes</b> — Fix failed checks and retry, or skip to proceed.</text>
          ) : null}
          <box height={1} />
        </>
      ) : (
        <text fg={c.textMuted}>No pre-flight results yet. Run a session to trigger checks.</text>
      )}
      <box height={1} />

      {h.length > 1 ? (
        <>
          <text fg={c.text}>
            <b>History ({h.length})</b>
          </text>
          <box height={1} />
          {h.slice(1, 6).map((entry) => (
            <box flexDirection="row" gap={2}>
              <text fg={c.textMuted}>{new Date(entry.timestamp).toLocaleTimeString()}</text>
              <text fg={entry.status === "passed" ? c.success : c.error}>
                {entry.status}
              </text>
              <text fg={c.text}>{entry.sessionID.slice(0, 8)}</text>
              <text fg={c.textMuted}>
                {entry.checks.filter((c) => c.status === "pass").length}/
                {entry.checks.length} passed
              </text>
            </box>
          ))}
          <box height={1} />
        </>
      ) : null}

      <box flexGrow={1} />
      <text fg={c.textMuted}>Pre-flight Check — Verify conditions before agent execution</text>
      <text fg={c.textMuted}>Use /evolution for flywheel | /monitor for guard metrics</text>
    </box>
  )
}
