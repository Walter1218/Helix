import { Switch, Match, onMount, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useRoute } from "./context/route"
import { Sidebar } from "./component/sidebar"
import { useTheme } from "./context/theme"
import { Home } from "./routes/home"
import { Chat } from "./routes/chat"
import { Project } from "./routes/project"
import { Monitor } from "./routes/monitor"
import { Settings } from "./routes/settings"

export function App() {
  const route = useRoute()
  const theme = useTheme()

  // 使用 useKeyboard 处理全局键盘事件
  useKeyboard((evt) => {
    // 数字键 1-5 切换页面
    if (evt.key >= "1" && evt.key <= "5" && !evt.ctrl && !evt.alt && !evt.meta) {
      const routes = ["home", "chat", "project", "monitor", "settings"] as const
      const index = parseInt(evt.key) - 1
      if (index >= 0 && index < routes.length) {
        route.navigate({ type: routes[index] })
      }
    }
  })

  return (
    <box
      flexDirection="row"
      width="100%"
      height="100%"
    >
      <Sidebar />
      <box flexGrow={1} flexDirection="column">
        <box
          height={1}
          backgroundColor={theme.getColor("backgroundSecondary")}
          border={false}
        >
          <text fg={theme.getColor("primary")} attributes={1}>
            HELIX
          </text>
          <text fg={theme.getColor("textMuted")}> TUI v0.1.0</text>
        </box>
        <box flexGrow={1}>
          <Switch>
            <Match when={route.data.type === "home"}>
              <Home />
            </Match>
            <Match when={route.data.type === "chat"}>
              <Chat />
            </Match>
            <Match when={route.data.type === "project"}>
              <Project />
            </Match>
            <Match when={route.data.type === "monitor"}>
              <Monitor />
            </Match>
            <Match when={route.data.type === "settings"}>
              <Settings />
            </Match>
          </Switch>
        </box>
        <box
          height={1}
          backgroundColor={theme.getColor("backgroundSecondary")}
          border={false}
          flexDirection="row"
          paddingLeft={1}
          justifyContent="space-between"
        >
          <text fg={theme.getColor("textMuted")}> [1-5] Navigate  [Ctrl+K] Commands</text>
          <text fg={theme.getColor("textMuted")}>{route.data.type} </text>
        </box>
      </box>
    </box>
  )
}
