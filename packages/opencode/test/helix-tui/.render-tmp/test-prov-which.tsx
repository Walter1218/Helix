import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { Show, createSignal } from "solid-js"
import { SDKProvider } from "@tui/context/sdk"
import { ProjectProvider } from "@tui/context/project"
import { SyncProvider } from "@tui/context/sync"

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough", targetFps: 60,
  exitOnCtrlC: false, useKittyKeyboard: {}, autoFocus: false,
  openConsoleOnError: false,
})

const [ready, setReady] = createSignal(false)

try {
  render(() => (
    <ExitProvider exit={() => renderer.destroy?.()}>
      <TuiPathsProvider value={{ cwd: process.cwd(), home: "/tmp", state: "/tmp", worktree: "/tmp" }}>
        <TuiStartupProvider value={{ initialRoute: undefined, skipInitialLoading: true }}>
          <KVProvider>
            <RouteProvider>
              <TuiConfigProvider config={{}}>
                <PluginRuntimeProvider value={createPluginRuntime()}>
                  <SDKProvider url="" directory="/tmp">
                    <ProjectProvider>
                      <SyncProvider>
                        <ThemeProvider mode="dark">
                          <Show when={ready()}>
                            <box width={80} height={10}><text>CHECK</text></box>
                          </Show>
                        </ThemeProvider>
                      </SyncProvider>
                    </ProjectProvider>
                  </SDKProvider>
                </PluginRuntimeProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </KVProvider>
        </TuiStartupProvider>
      </TuiPathsProvider>
    </ExitProvider>
  ), renderer)
} catch(e) {
  console.error("RENDER ERROR:", (e as any)?.message ?? String(e))
  process.exit(1)
}

setTimeout(() => setReady(true), 500)
setTimeout(() => renderer.destroy?.(), 4000)
await new Promise(r => setTimeout(r, 4500))
console.error("OK")
