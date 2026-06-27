import type { TuiPluginApi } from "@mimo-ai/plugin/tui"

export interface JudgeVerdictData {
  sessionID: string
  id: string
  status: "pass" | "fail" | "question"
  checks: string[]
  summary: string
}

export function JudgeVerdictDialog(props: { api: TuiPluginApi; data: JudgeVerdictData }) {
  const { api, data } = props
  const c = api.theme.current

  const statusColor = data.status === "pass" ? c.success : data.status === "question" ? c.warning : c.error
  const statusLabel = data.status === "pass" ? "PASSED" : data.status === "question" ? "NEEDS REVIEW" : "VIOLATION"

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Judge Verdict</b>
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
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Summary: </text>
        <text fg={c.text} wrapMode="word">
          {data.summary || "No summary provided"}
        </text>
      </box>
      <box height={1} />
      <text fg={c.text}>
        <b>Checks ({data.checks.length})</b>
      </text>
      {data.checks.map((check, i) => (
        <box flexDirection="row" gap={2}>
          <text fg={data.status === "pass" ? c.success : c.warning}>
            {data.status === "pass" ? "✓" : "⊘"}
          </text>
          <text fg={c.textMuted} wrapMode="word">
            {check}
          </text>
        </box>
      ))}
      <box height={1} />
      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Session: </text>
        <text fg={c.text}>{data.sessionID}</text>
      </box>
    </box>
  )
}
