import type { TuiPluginApi } from "@mimo-ai/plugin/tui"

export interface PreflightCheckItem {
  id: string
  name: string
  passed: boolean
  level: string
  message: string
}

export interface PreflightResultData {
  sessionID: string
  passed: boolean
  blocked: boolean
  paused: boolean
  results: PreflightCheckItem[]
}

export function PreflightResultDialog(props: { api: TuiPluginApi; data: PreflightResultData }) {
  const { api, data } = props
  const c = api.theme.current

  const statusColor = data.blocked ? c.error : data.paused ? c.warning : data.passed ? c.success : c.warning
  const statusLabel = data.blocked ? "BLOCKED" : data.paused ? "PAUSED" : data.passed ? "PASSED" : "WARNINGS"

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Pre-flight Check</b>
        </text>
        <text fg={c.textMuted} onMouseDown={() => api.ui.dialog.clear()}>
          esc
        </text>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Status: </text>
        <text fg={statusColor}>
          <b>{statusLabel}</b>
        </text>
      </box>
      <box height={1} />

      {data.results.length > 0 ? (
        data.results.map((check) => {
          const checkColor = !check.passed ? c.error : check.level === "warn" ? c.warning : check.level === "info" ? c.textMuted : c.success
          const checkIcon = !check.passed ? "✗" : check.level === "warn" ? "⚠" : "✓"
          return (
            <box flexDirection="row" gap={2}>
              <text fg={checkColor} flexShrink={0}>
                {checkIcon}
              </text>
              <text fg={c.text}>
                <b>{check.name}</b>
              </text>
              <text fg={c.textMuted} wrapMode="word">
                {check.message}
              </text>
            </box>
          )
        })
      ) : (
        <text fg={c.textMuted}>No checks configured</text>
      )}

      <box height={1} />
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Session: </text>
        <text fg={c.text}>{data.sessionID}</text>
      </box>
    </box>
  )
}
