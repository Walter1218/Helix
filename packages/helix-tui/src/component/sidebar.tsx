import { createSignal, For, onMount, onCleanup } from "solid-js"
import { useRoute, type Route } from "../context/route"
import { useTheme } from "../context/theme"

type NavItem = {
  id: string
  label: string
  icon: string
  route: Route
}

export function Sidebar() {
  const route = useRoute()
  const theme = useTheme()
  const [collapsed, setCollapsed] = createSignal(false)

  const navItems: NavItem[] = [
    { id: "home", label: "Home", icon: "~", route: { type: "home" } },
    { id: "chat", label: "Chat", icon: ">", route: { type: "chat" } },
    { id: "project", label: "Project", icon: "#", route: { type: "project" } },
    { id: "monitor", label: "Monitor", icon: "@", route: { type: "monitor" } },
    { id: "settings", label: "Settings", icon: "*", route: { type: "settings" } },
  ]

  const isActive = (item: NavItem) => route.data.type === item.route.type

  const navigate = (item: NavItem) => {
    route.navigate(item.route)
  }

  return (
    <box
      flexDirection="column"
      width={collapsed() ? 3 : 16}
      flexShrink={0}
      border={false}
      borderColor={theme.getColor("border")}
      backgroundColor={theme.getColor("backgroundSecondary")}
    >
      <box height={1} />
      <For each={navItems}>
        {(item) => (
          <box
            flexDirection="row"
            paddingLeft={1}
            paddingRight={1}
            height={1}
            backgroundColor={isActive(item) ? theme.getColor("primary") : undefined}
            onMouseDown={() => navigate(item)}
          >
            <text
              fg={isActive(item) ? theme.getColor("textInverse") : theme.getColor("text")}
            >
              {collapsed() ? ` ${item.icon} ` : ` ${item.icon} ${item.label}`}
            </text>
          </box>
        )}
      </For>
      <box flexGrow={1} />
      <box
        flexDirection="row"
        paddingLeft={1}
        paddingRight={1}
        height={1}
        onMouseDown={() => setCollapsed(!collapsed())}
      >
        <text fg={theme.getColor("textMuted")}>
          {collapsed() ? " > " : " < Collapse"}
        </text>
      </box>
      <box height={1} />
    </box>
  )
}
