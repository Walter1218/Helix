import { createSignal, For, onMount, Show } from "solid-js"
import { useTheme } from "../context/theme"

type Project = {
  id: string
  name: string
  path: string
  status: "active" | "inactive" | "error"
}

type Tab = "projects" | "tasks" | "files"

export function Project() {
  const theme = useTheme()
  const [tab, setTab] = createSignal<Tab>("projects")
  const [projects, setProjects] = createSignal<Project[]>([])
  const [selected, setSelected] = createSignal(0)
  const [isLoading, setIsLoading] = createSignal(true)

  onMount(async () => {
    // Simulate loading projects
    setTimeout(() => {
      setProjects([
        { id: "1", name: "Helix", path: "~/projects/helix", status: "active" },
        { id: "2", name: "My App", path: "~/projects/myapp", status: "active" },
        { id: "3", name: "Legacy", path: "~/legacy", status: "inactive" },
      ])
      setIsLoading(false)
    }, 500)
  })

  const tabs: { id: Tab; label: string }[] = [
    { id: "projects", label: "Projects" },
    { id: "tasks", label: "Tasks" },
    { id: "files", label: "Files" },
  ]

  const statusColor = (status: Project["status"]) => {
    switch (status) {
      case "active":
        return theme.getColor("success")
      case "inactive":
        return theme.getColor("textMuted")
      case "error":
        return theme.getColor("error")
    }
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        height={1}
        backgroundColor={theme.getColor("backgroundSecondary")}
        flexDirection="row"
        paddingLeft={1}
      >
        <For each={tabs}>
          {(t) => (
            <box
              flexDirection="row"
              paddingLeft={1}
              paddingRight={1}
              onMouseDown={() => setTab(t.id)}
            >
              <text
                fg={tab() === t.id ? theme.getColor("primary") : theme.getColor("textMuted")}
                attributes={tab() === t.id ? 1 : 0}
              >
                [{t.label}]
              </text>
            </box>
          )}
        </For>
      </box>

      <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
        <Show when={tab() === "projects"}>
          <text fg={theme.getColor("primary")} attributes={1}>
            Project List
          </text>
          <box height={1} />

          <Show when={isLoading()}>
            <text fg={theme.getColor("textMuted")}>Loading projects...</text>
          </Show>

          <Show when={!isLoading() && projects().length === 0}>
            <text fg={theme.getColor("textMuted")}>No projects found</text>
          </Show>

          <For each={projects()}>
            {(project, index) => (
              <box
                flexDirection="row"
                paddingLeft={1}
                backgroundColor={index() === selected() ? theme.getColor("backgroundTertiary") : undefined}
                onMouseDown={() => setSelected(index())}
              >
                <text fg={statusColor(project.status)}>● </text>
                <text fg={theme.getColor("text")}>{project.name}</text>
                <text fg={theme.getColor("textMuted")}> {project.path}</text>
              </box>
            )}
          </For>
        </Show>

        <Show when={tab() === "tasks"}>
          <text fg={theme.getColor("primary")} attributes={1}>
            Task Management
          </text>
          <box height={1} />
          <box flexDirection="column" border borderColor={theme.getColor("border")} padding={1}>
            <text fg={theme.getColor("textMuted")}>
              Task management integration coming soon...
            </text>
          </box>
        </Show>

        <Show when={tab() === "files"}>
          <text fg={theme.getColor("primary")} attributes={1}>
            File Browser
          </text>
          <box height={1} />
          <box flexDirection="column" border borderColor={theme.getColor("border")} padding={1}>
            <text fg={theme.getColor("textMuted")}>
              File browser integration coming soon...
            </text>
          </box>
        </Show>
      </box>

      <box
        height={1}
        backgroundColor={theme.getColor("backgroundSecondary")}
        paddingLeft={1}
      >
        <text fg={theme.getColor("textMuted")}>
          ↑↓ Navigate  Enter Select  Tab Switch View
        </text>
      </box>
    </box>
  )
}
