import { createSignal, Show } from "solid-js"
import { useTheme } from "../context/theme"

export interface ReasoningPartProps {
  text: string
  duration?: number
  defaultCollapsed?: boolean
}

export function ReasoningPart(props: ReasoningPartProps) {
  const theme = useTheme()
  const [collapsed, setCollapsed] = createSignal(props.defaultCollapsed ?? true)

  const durationText = () => {
    if (!props.duration) return ""
    if (props.duration < 1000) return `${props.duration}ms`
    if (props.duration < 60000) return `${(props.duration / 1000).toFixed(1)}s`
    return `${Math.floor(props.duration / 60000)}m ${Math.round((props.duration % 60000) / 1000)}s`
  }

  const preview = () => {
    const text = props.text
    if (text.length <= 100) return text
    return text.slice(0, 100) + "..."
  }

  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row" onMouseDown={() => setCollapsed(!collapsed())}>
        <text fg={theme.getColor("textMuted")} attributes={1}>
          {collapsed() ? "▶" : "▼"} 💭 Thinking
        </text>
        <Show when={durationText()}>
          <text fg={theme.getColor("textMuted")}> ({durationText()})</text>
        </Show>
      </box>
      <Show when={collapsed()}>
        <text fg={theme.getColor("textMuted")} paddingLeft={2}>
          {preview()}
        </text>
      </Show>
      <Show when={!collapsed()}>
        <box flexDirection="column" paddingLeft={2} marginTop={1}>
          <text fg={theme.getColor("textMuted")}>
            {props.text}
          </text>
        </box>
      </Show>
    </box>
  )
}
