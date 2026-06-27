import type { TuiPluginApi } from "@mimo-ai/plugin/tui"
import { createSignal, For, Show } from "solid-js"

interface RoadmapTask {
  id: string
  title: string
  status: string
}

export function ProjectRoute(_props: { api: TuiPluginApi }) {
  const [mode, setMode] = createSignal("tasks")
  const [taskList] = createSignal<RoadmapTask[]>([])
  const [files] = createSignal<string[]>([])

  const c = _props.api.theme.current

  const statusColor = (status: string) => {
    if (status === "completed") return c.success
    if (status === "in_progress" || status === "running") return c.primary
    if (status === "failed") return c.error
    return c.textMuted
  }

  return (
    <box flexDirection="column" paddingLeft={4} paddingRight={4} paddingTop={2} gap={1} flexGrow={1}>
      <text fg={c.primary}>
        <b>Helix Project</b>
      </text>
      <box height={1} />

      <box flexDirection="row" gap={2}>
        <text fg={mode() === "tasks" ? c.primary : c.textMuted} onMouseDown={() => setMode("tasks")}>
          Tasks
        </text>
        <text fg={mode() === "files" ? c.primary : c.textMuted} onMouseDown={() => setMode("files")}>
          Files
        </text>
        <text fg={c.textMuted}>Roadmap</text>
      </box>
      <box height={1} />

      <Show when={mode() === "tasks"}>
        <Show
          when={taskList().length > 0}
          fallback={<text fg={c.textMuted}>No active tasks. Helix Roadmap tasks will appear here.</text>}
        >
          <For each={taskList()}>
            {(task) => (
              <box flexDirection="row" gap={2}>
                <text fg={statusColor(task.status)}>•</text>
                <text fg={c.text}>{task.title}</text>
                <text fg={statusColor(task.status)}>[{task.status}]</text>
              </box>
            )}
          </For>
        </Show>
      </Show>

      <Show when={mode() === "files"}>
        <Show
          when={files().length > 0}
          fallback={<text fg={c.textMuted}>No files. Project file browser will display here.</text>}
        >
          <For each={files()}>
            {(file) => <text fg={c.textMuted}>{file}</text>}
          </For>
        </Show>
      </Show>

      <box flexGrow={1} />
      <text fg={c.textMuted}>Helix Project — Roadmap tasks / OpenSpec specs / File browser</text>
    </box>
  )
}
