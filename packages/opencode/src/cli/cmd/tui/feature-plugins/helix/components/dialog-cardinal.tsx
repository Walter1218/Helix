import type { TuiPluginApi } from "@mimo-ai/plugin/tui"

export interface CardinalAlertData {
  sessionID: string
  id: string
  cardinalType: string
  severity: "block" | "pause" | "stop" | "warn"
  message: string
}

export function CardinalAlertDialog(props: { api: TuiPluginApi; data: CardinalAlertData }) {
  const { api, data } = props
  const c = api.theme.current

  const severityColor = () => {
    switch (data.severity) {
      case "block":
        return c.error
      case "pause":
        return c.warning
      case "stop":
        return c.warning
      case "warn":
        return c.textMuted
      default:
        return c.text
    }
  }

  const severityLabel = () => {
    switch (data.severity) {
      case "block":
        return "BLOCKED"
      case "pause":
        return "PAUSED"
      case "stop":
        return "STOPPED"
      case "warn":
        return "WARNING"
      default:
        return (data.severity as string).toUpperCase()
    }
  }

  const severityDescription = () => {
    switch (data.severity) {
      case "block":
        return "严重风险 — 已终止执行。请检查并修复后重试。"
      case "pause":
        return "中等风险 — 已暂停执行。请确认是否继续。"
      case "stop":
        return "轻微风险 — 已停止执行。建议检查后手动恢复。"
      case "warn":
        return "潜在风险 — 继续执行中。请注意监控。"
      default:
        return ""
    }
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={c.primary}>
          <b>Cardinal Alert</b>
        </text>
        <text fg={c.textMuted} onMouseDown={() => api.ui.dialog.clear()}>
          esc
        </text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Rule: </text>
        <text fg={c.text}>
          <b>{data.cardinalType}</b>
        </text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Severity: </text>
        <text fg={severityColor()}>
          <b>{severityLabel()}</b>
        </text>
      </box>

      <box height={1} />
      <box paddingLeft={2} paddingRight={2}>
        <text fg={severityColor()} wrapMode="word">
          {severityDescription()}
        </text>
      </box>
      <box height={1} />

      <box paddingLeft={2} paddingRight={2}>
        <text fg={c.text} wrapMode="word">
          {data.message}
        </text>
      </box>

      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={c.textMuted}>Session: </text>
        <text fg={c.text}>{data.sessionID}</text>
      </box>

      <Show when={data.severity === "block" || data.severity === "stop"}>
        <box height={1} />
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
          <text fg={c.error}>
            <b>⚠ 执行已被系统终止。请检查问题后重新提交任务。</b>
          </text>
        </box>
      </Show>
    </box>
  )
}

function Show(props: { when: boolean; children: unknown }) {
  return props.when ? (props.children as object) : null
}
