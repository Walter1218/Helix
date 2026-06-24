import { useTheme } from "../context/theme"

export function Home() {
  const theme = useTheme()

  return (
    <box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <box height={2} />
      <text fg={theme.getColor("primary")} attributes={1}>
        ██╗  ██╗███████╗██╗     ██╗██╗  ██╗
      </text>
      <text fg={theme.getColor("primary")} attributes={1}>
        ██║  ██║██╔════╝██║     ██║╚██╗██╔╝
      </text>
      <text fg={theme.getColor("primary")} attributes={1}>
        ███████║█████╗  ██║     ██║ ╚███╔╝
      </text>
      <text fg={theme.getColor("primaryLight")} attributes={1}>
        ██╔══██║██╔══╝  ██║     ██║ ██╔██╗
      </text>
      <text fg={theme.getColor("primaryLight")} attributes={1}>
        ██║  ██║███████╗███████╗██║██╔╝ ██╗
      </text>
      <text fg={theme.getColor("primaryLight")} attributes={1}>
        ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝╚═╝  ╚═╝
      </text>
      <box height={1} />
      <text fg={theme.getColor("secondary")}>
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      </text>
      <box height={1} />
      <text fg={theme.getColor("accent")} attributes={1}>
        ⚡ AI-Powered Development Tool ⚡
      </text>
      <box height={2} />
      <text fg={theme.getColor("textMuted")}>
        [1] Start Chat    [2] Open Project    [3] Monitor    [4] Settings
      </text>
      <box height={1} />
      <text fg={theme.getColor("textMuted")}>
        Type a command or press Ctrl+K for command palette
      </text>
    </box>
  )
}
