import { Show, For } from "solid-js"
import { useTheme } from "../../context/theme"
import type { RGBA } from "@opentui/core"

export type ToolCallStatus = "running" | "done" | "error"

export interface ToolCallData {
  id: string
  name: string
  input: string
  output?: string
  status: ToolCallStatus
}

function StatusIcon(props: { status: ToolCallStatus }) {
  const theme = useTheme()
  return (
    <text
      fg={
        props.status === "running"
          ? theme.getColor("warning")
          : props.status === "error"
            ? theme.getColor("error")
            : theme.getColor("success")
      }
      attributes={1}
    >
      {props.status === "running" ? "⟳" : props.status === "error" ? "✗" : "✓"}
    </text>
  )
}

function TruncatedText(props: { text: string; maxLen: number; fg: RGBA; paddingLeft?: number }) {
  const truncated = () => (props.text.length > props.maxLen ? props.text.slice(0, props.maxLen) + "..." : props.text)
  return (
    <text fg={props.fg} paddingLeft={props.paddingLeft ?? 2}>
      {truncated()}
    </text>
  )
}

export function BashRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { command: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}bash
        </text>
        <Show when={props.tool.status === "running"}>
          <text fg={theme.getColor("textMuted")}> running...</text>
        </Show>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        $ {parsed().command || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={500} fg={theme.getColor("text")} />
      </Show>
      <Show when={props.tool.output && props.tool.status === "error"}>
        <TruncatedText text={props.tool.output!} maxLen={500} fg={theme.getColor("error")} />
      </Show>
    </box>
  )
}

export function ReadRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { filePath: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}read
        </text>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        📄 {parsed().filePath || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={300} fg={theme.getColor("textMuted")} />
      </Show>
    </box>
  )
}

export function WriteRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { filePath: props.tool.input }
    }
  }
  const lineCount = () => {
    try {
      const data = JSON.parse(props.tool.input)
      return data.content?.split("\n").length ?? 0
    } catch {
      return 0
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}write
        </text>
        <Show when={lineCount() > 0}>
          <text fg={theme.getColor("textMuted")}> ({lineCount()} lines)</text>
        </Show>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        ✏️ {parsed().filePath || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={200} fg={theme.getColor("success")} />
      </Show>
    </box>
  )
}

export function EditRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { filePath: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}edit
        </text>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        🔧 {parsed().filePath || props.tool.input}
      </text>
      <Show when={parsed().oldString}>
        <box flexDirection="column" paddingLeft={2} marginTop={1}>
          <text fg={theme.getColor("error")}>- {parsed().oldString?.slice(0, 100)}</text>
          <text fg={theme.getColor("success")}>+ {parsed().newString?.slice(0, 100)}</text>
        </box>
      </Show>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={200} fg={theme.getColor("success")} />
      </Show>
    </box>
  )
}

export function GlobRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { pattern: props.tool.input }
    }
  }
  const resultCount = () => {
    if (!props.tool.output) return 0
    try {
      const data = JSON.parse(props.tool.output)
      return Array.isArray(data) ? data.length : 0
    } catch {
      return props.tool.output.split("\n").length
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}glob
        </text>
        <Show when={resultCount() > 0}>
          <text fg={theme.getColor("textMuted")}> ({resultCount()} files)</text>
        </Show>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        🔍 {parsed().pattern || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={300} fg={theme.getColor("textMuted")} />
      </Show>
    </box>
  )
}

export function GrepRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { pattern: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}grep
        </text>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        🔎 {parsed().pattern || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={400} fg={theme.getColor("textMuted")} />
      </Show>
    </box>
  )
}

export function WebFetchRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { url: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}webfetch
        </text>
      </box>
      <text fg={theme.getColor("info")} paddingLeft={2}>
        🌐 {parsed().url || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={300} fg={theme.getColor("textMuted")} />
      </Show>
    </box>
  )
}

export function TaskRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  const parsed = () => {
    try {
      return JSON.parse(props.tool.input)
    } catch {
      return { summary: props.tool.input }
    }
  }
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}task
        </text>
      </box>
      <text fg={theme.getColor("warning")} paddingLeft={2}>
        📋 {parsed().summary || parsed().action || props.tool.input}
      </text>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={200} fg={theme.getColor("success")} />
      </Show>
    </box>
  )
}

export function GenericRenderer(props: { tool: ToolCallData }) {
  const theme = useTheme()
  return (
    <box flexDirection="column" paddingLeft={2} marginTop={1}>
      <box flexDirection="row">
        <StatusIcon status={props.tool.status} />
        <text fg={theme.getColor("accent")} attributes={1}>
          {" "}
          {props.tool.name}
        </text>
        <Show when={props.tool.status === "running"}>
          <text fg={theme.getColor("textMuted")}> running...</text>
        </Show>
      </box>
      <Show when={props.tool.input}>
        <TruncatedText text={props.tool.input} maxLen={200} fg={theme.getColor("textMuted")} />
      </Show>
      <Show when={props.tool.output && props.tool.status === "done"}>
        <TruncatedText text={props.tool.output!} maxLen={500} fg={theme.getColor("text")} />
      </Show>
      <Show when={props.tool.output && props.tool.status === "error"}>
        <TruncatedText text={props.tool.output!} maxLen={500} fg={theme.getColor("error")} />
      </Show>
    </box>
  )
}

export function ToolRenderer(props: { tool: ToolCallData }) {
  const renderers: Record<string, (p: { tool: ToolCallData }) => any> = {
    bash: BashRenderer,
    Bash: BashRenderer,
    read: ReadRenderer,
    Read: ReadRenderer,
    write: WriteRenderer,
    Write: WriteRenderer,
    edit: EditRenderer,
    Edit: EditRenderer,
    glob: GlobRenderer,
    Glob: GlobRenderer,
    grep: GrepRenderer,
    Grep: GrepRenderer,
    webfetch: WebFetchRenderer,
    WebFetch: WebFetchRenderer,
    task: TaskRenderer,
    Task: TaskRenderer,
  }
  const Renderer = renderers[props.tool.name] ?? GenericRenderer
  return <Renderer tool={props.tool} />
}
