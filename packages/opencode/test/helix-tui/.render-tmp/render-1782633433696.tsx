
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

import { ExitProvider, useExit } from "./src/cli/cmd/tui/context/exit"
import { TuiPathsProvider } from "./src/cli/cmd/tui/context/runtime"
import { TuiStartupProvider } from "./src/cli/cmd/tui/context/runtime"
import { KVProvider } from "./src/cli/cmd/tui/context/kv"
import { RouteProvider } from "./src/cli/cmd/tui/context/route"
import { TuiConfigProvider } from "./src/cli/cmd/tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "./src/cli/cmd/tui/plugin/runtime"
import { ThemeProvider } from "./src/cli/cmd/tui/context/theme"
import { createSignal, Show } from "solid-js"

function App() {
  const [ready] = createSignal(true)
  return (
    <Show when={ready()}>
      <box width={80} height={20} flexDirection="column">
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <text>APP_RENDERED_OK</text>
        </box>
      </box>
    </Show>
  )
}

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (<ExitProvider exit={() => renderer.destroy?.()}>
        <TuiPathsProvider value={{ cwd: process.cwd(), home: "/tmp", state: "/tmp", worktree: "/tmp" }}>
          <TuiStartupProvider value={{ initialRoute: undefined, skipInitialLoading: true }}>
            <KVProvider>
              <RouteProvider>
                <TuiConfigProvider config={{}}>
                  <PluginRuntimeProvider value={createPluginRuntime()}>
                    <ThemeProvider mode="dark">
                      <App />
                    </ThemeProvider>
                  </PluginRuntimeProvider>
                </TuiConfigProvider>
              </RouteProvider>
            </KVProvider>
          </TuiStartupProvider>
        </TuiPathsProvider>
      </ExitProvider>), renderer)
setTimeout(() => renderer.destroy?.(), 2000)
await new Promise(r => setTimeout(r, 2500))
