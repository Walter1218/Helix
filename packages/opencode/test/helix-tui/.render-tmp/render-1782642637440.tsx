
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"

import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { ArgsProvider } from "@tui/context/args"
import { ErrorBoundary, Show, createSignal } from "solid-js"

// Minimal stub for SDK
const SDKProvider = (p: any) => p.children
const SyncProvider = (p: any) => p.children
const ProjectProvider = (p: any) => p.children

function RealApp() {
  const [ready] = createSignal(true)
  return (
    <ErrorBoundary fallback={(e: Error) => <text>{'ERR:' + e.message.slice(0, 60)}</text>}>
      <Show when={ready()}>
        <box width={80} height={20} flexDirection="column">
          <box flexGrow={1} alignItems="center" justifyContent="center">
            <text>REAL_APP_WORKS</text>
          </box>
        </box>
      </Show>
    </ErrorBoundary>
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
                    <ArgsProvider>
                      <SDKProvider>
                        <ProjectProvider>
                          <SyncProvider>
                            <ThemeProvider mode="dark">
                              <RealApp />
                            </ThemeProvider>
                          </SyncProvider>
                        </ProjectProvider>
                      </SDKProvider>
                    </ArgsProvider>
                  </PluginRuntimeProvider>
                </TuiConfigProvider>
              </RouteProvider>
            </KVProvider>
          </TuiStartupProvider>
        </TuiPathsProvider>
      </ExitProvider>), renderer)
setTimeout(() => renderer.destroy?.(), 2000)
await new Promise(r => setTimeout(r, 2500))
