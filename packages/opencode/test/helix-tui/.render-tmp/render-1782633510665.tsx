
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
import { Home } from "@tui/routes/home"
import { PromptRefProvider } from "@tui/context/prompt"
import { LocalProvider } from "@tui/context/local"
import { ProjectProvider } from "@tui/context/project"
import { SyncProvider } from "@tui/context/sync"
import { SDKProvider } from "@tui/context/sdk"
import { DataProvider } from "@tui/context/data"
import { PromptStashProvider } from "@tui/component/prompt/stash"
import { FrecencyProvider } from "@tui/component/prompt/frecency"
import { PromptHistoryProvider } from "@tui/component/prompt/history"
import { DialogProvider } from "@tui/ui/dialog"
import { ToastProvider } from "@tui/ui/toast"
import { ErrorBoundary, Show, createSignal } from "solid-js"

function App() {
  const [ready] = createSignal(true)
  return (
    <ErrorBoundary fallback={(e: Error) => <text>{'ERR:' + e.message.slice(0, 80)}</text>}>
      <Show when={ready()}>
        <Home />
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
              <ToastProvider>
                <RouteProvider>
                  <TuiConfigProvider config={{}}>
                    <PluginRuntimeProvider value={createPluginRuntime()}>
                      <SDKProvider url="" directory="/tmp">
                        <ProjectProvider>
                          <SyncProvider>
                            <DataProvider>
                              <ThemeProvider mode="dark">
                                <PromptRefProvider>
                                  <PromptStashProvider>
                                    <DialogProvider>
                                      <FrecencyProvider>
                                        <PromptHistoryProvider>
                                          <ArgsProvider>
                                            <LocalProvider>
                                              <App />
                                            </LocalProvider>
                                          </ArgsProvider>
                                        </PromptHistoryProvider>
                                      </FrecencyProvider>
                                    </DialogProvider>
                                  </PromptStashProvider>
                                </PromptRefProvider>
                              </ThemeProvider>
                            </DataProvider>
                          </SyncProvider>
                        </ProjectProvider>
                      </SDKProvider>
                    </PluginRuntimeProvider>
                  </TuiConfigProvider>
                </RouteProvider>
              </ToastProvider>
            </KVProvider>
          </TuiStartupProvider>
        </TuiPathsProvider>
      </ExitProvider>), renderer)
setTimeout(() => renderer.destroy?.(), 3000)
await new Promise(r => setTimeout(r, 3500))
