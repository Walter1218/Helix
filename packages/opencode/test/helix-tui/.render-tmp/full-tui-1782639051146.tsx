
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { createSignal, Show, ErrorBoundary } from "solid-js"
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { ToastProvider } from "@tui/ui/toast"
import { SDKProvider } from "@tui/context/sdk"
import { SyncProvider } from "@tui/context/sync"
import { DataProvider } from "@tui/context/data"
import { ProjectProvider } from "@tui/context/project"
import { ArgsProvider } from "@tui/context/args"
import { LocalProvider } from "@tui/context/local"
import { PromptRefProvider } from "@tui/context/prompt"
import { PromptStashProvider } from "@tui/component/prompt/stash"
import { DialogProvider } from "@tui/ui/dialog"
import { FrecencyProvider } from "@tui/component/prompt/frecency"
import { PromptHistoryProvider } from "@tui/component/prompt/history"
import { Home } from "@tui/routes/home"


const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
  openConsoleOnError: false,
})

const [ready, setReady] = createSignal(false)

render(() => (
  <ExitProvider exit={() => renderer.destroy?.()}>
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
                            <ErrorBoundary fallback={(e: Error) => <text>ERR: {e.message.slice(0, 80)}</text>}>
                              <PromptRefProvider>
                                <PromptStashProvider>
                                  <DialogProvider>
                                    <FrecencyProvider>
                                      <PromptHistoryProvider>
                                        <ArgsProvider>
                                          <LocalProvider>
                                            <Show when={ready()}>
                                              <Home />
                                            </Show>
                                          </LocalProvider>
                                        </ArgsProvider>
                                      </PromptHistoryProvider>
                                    </FrecencyProvider>
                                  </DialogProvider>
                                </PromptStashProvider>
                              </PromptRefProvider>
                            </ErrorBoundary>
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
  </ExitProvider>
), renderer)

// Let providers initialize, then show content
setTimeout(() => setReady(true), 500)
setTimeout(() => renderer.destroy?.(), 6000)
await new Promise(r => setTimeout(r, 6500))
