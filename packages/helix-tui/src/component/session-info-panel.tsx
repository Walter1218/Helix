import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import type { DisplayMessage } from "../routes/chat"

export function SessionInfoPanel(props: {
  sessionID?: string | null
  sessionTitle?: string
  connected?: boolean
  messages?: DisplayMessage[]
  mode?: string
  model?: string
  wide?: boolean
}) {
  const theme = useTheme()

  const totalTokens = () => {
    const msgs = props.messages ?? []
    let total = 0
    for (const m of msgs) {
      total += m.content.length / 4 // rough estimate: 1 token ~ 4 chars
    }
    return Math.round(total)
  }

  const contextPercent = () => {
    const t = totalTokens()
    const max = 1_000_000 // Default context window: 1M tokens (matches backend DEFAULT_CONTEXT_WINDOW)
    return Math.min(100, Math.round((t / max) * 100))
  }

  const activeAgents = () => {
    const agents = new Set<string>()
    const msgs = props.messages ?? []
    for (const m of msgs) {
      if (m.agent) agents.add(m.agent)
    }
    return Array.from(agents)
  }

  const userMessages = () => (props.messages ?? []).filter((m) => m.role === "user").length
  const assistantMessages = () => (props.messages ?? []).filter((m) => m.role === "assistant").length

  return (
    <Show when={props.wide}>
      <box
        width={36}
        flexDirection="column"
        flexShrink={0}
        border={true}
        borderColor={theme.getColor("border")}
        backgroundColor={theme.getColor("backgroundSecondary")}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
      >
        {/* Session Title */}
        <box flexDirection="row" height={1} justifyContent="space-between">
          <text fg={theme.getColor("primary")} attributes={1}>
            {props.sessionTitle ?? "New Chat"}
          </text>
          <text fg={props.connected ? theme.getColor("success") : theme.getColor("error")}>
            {props.connected ? "●" : "○"}
          </text>
        </box>

        <box height={1} />

        {/* Context Info */}
        <box flexDirection="column" gap={1} paddingTop={1}>
            <text fg={theme.getColor("accent")} attributes={1}>Context</text>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Tokens: </text>
            <text fg={theme.getColor("text")}>{totalTokens().toLocaleString()} / 1,000,000 ({contextPercent()}%)</text>
          </box>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Messages: </text>
            <text fg={theme.getColor("text")}>{userMessages()} / {assistantMessages()}</text>
          </box>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>TPS: </text>
            <text fg={theme.getColor("text")}>--</text>
          </box>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Cost: </text>
            <text fg={theme.getColor("text")}>$--</text>
          </box>
        </box>

        <box height={1} />

        {/* Active Agents */}
        <box flexDirection="column" gap={1} paddingTop={1}>
          <text fg={theme.getColor("accent")} attributes={1}>Active Agents</text>
          <Show when={activeAgents().length > 0} fallback={<text fg={theme.getColor("textMuted")}>No sub-agents</text>}>
            <box flexDirection="column">
              {activeAgents().map((a) => (
                <box height={1}>
                  <text fg={theme.getColor("text")}>• {a}</text>
                </box>
              ))}
            </box>
          </Show>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Mode: </text>
            <text fg={theme.getColor("text")}>{props.mode ?? "--"}</text>
          </box>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Model: </text>
            <text fg={theme.getColor("text")}>{props.model ?? "--"}</text>
          </box>
        </box>

        <box height={1} />

        {/* Workspace */}
        <box flexDirection="column" gap={1} paddingTop={1}>
          <text fg={theme.getColor("accent")} attributes={1}>Workspace</text>
          <box height={1} flexDirection="row">
            <text fg={theme.getColor("textMuted")}>Path: </text>
            <text fg={theme.getColor("text")}>{process.cwd().slice(-30)}</text>
          </box>
        </box>

        <box flexGrow={1} />

        {/* Footer */}
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg={theme.getColor("textMuted")}>Helix TUI v0.1.0</text>
          <text fg={theme.getColor("textMuted")}>Ctrl+K</text>
        </box>
      </box>
    </Show>
  )
}
