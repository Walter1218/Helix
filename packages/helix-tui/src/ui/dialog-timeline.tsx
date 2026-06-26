import { createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import type { DisplayMessage } from "../routes/chat"
import * as trace from "../trace"

interface TimelineEntry {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  agent?: string
}

interface DialogTimelineProps {
  messages: DisplayMessage[]
  onJumpTo: (messageId: string) => void
}

export function DialogTimeline(props: DialogTimelineProps) {
  const theme = useTheme()
  const [selectedIndex, setSelectedIndex] = createSignal(props.messages.length - 1)

  const entries = (): TimelineEntry[] =>
    props.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content.slice(0, 80) + (m.content.length > 80 ? "..." : ""),
      timestamp: m.timestamp,
      agent: m.agent,
    }))

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  const roleIcon = (role: string) => {
    switch (role) {
      case "user":
        return ">"
      case "assistant":
        return "*"
      case "system":
        return "#"
      default:
        return "-"
    }
  }

  const roleColor = (role: string) => {
    switch (role) {
      case "user":
        return theme.getColor("primary")
      case "assistant":
        return theme.getColor("success")
      case "system":
        return theme.getColor("warning")
      default:
        return theme.getColor("textMuted")
    }
  }

  return (
    <box flexDirection="column" width={88} height="100%">
      <box flexDirection="row" paddingBottom={1}>
        <text fg={theme.getColor("primary")} attributes={1}>
          Timeline
        </text>
        <text fg={theme.getColor("textMuted")}> ({entries().length} messages)</text>
      </box>
      <text fg={theme.getColor("border")}>{"─".repeat(86)}</text>

      <box flexDirection="column" flexGrow={1} overflow="hidden">
        <For each={entries()}>
          {(entry, i) => (
            <box
              flexDirection="row"
              onMouseDown={() => {
                setSelectedIndex(i())
                props.onJumpTo(entry.id)
              }}
            >
              <text fg={i() === selectedIndex() ? theme.getColor("primary") : theme.getColor("textMuted")} attributes={i() === selectedIndex() ? 1 : 0}>
                {i() === selectedIndex() ? "▸" : " "}
              </text>
              <text fg={theme.getColor("textMuted")}> {formatTime(entry.timestamp)} </text>
              <text fg={roleColor(entry.role)}>{roleIcon(entry.role)} </text>
              <text fg={i() === selectedIndex() ? theme.getColor("text") : theme.getColor("textMuted")}>
                {entry.content}
              </text>
              <Show when={entry.agent}>
                <text fg={theme.getColor("accent")}> [{entry.agent}]</text>
              </Show>
            </box>
          )}
        </For>
      </box>

      <text fg={theme.getColor("border")}>{"─".repeat(86)}</text>
      <box flexDirection="row" paddingTop={1}>
        <text fg={theme.getColor("textMuted")}>Up/Down: navigate | Enter: jump | Esc: close</text>
      </box>
    </box>
  )
}

export function showTimeline(messages: DisplayMessage[], onJumpTo: (messageId: string) => void) {
  trace.emit("session.dialog.open", "info", "Showing timeline dialog", { messageCount: messages.length })
  const { replace, clear, setSize } = useDialog()
  setSize("large")
  replace(
    <DialogTimeline
      messages={messages}
      onJumpTo={(id) => {
        clear()
        onJumpTo(id)
      }}
    />,
  )
}
