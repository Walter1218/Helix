
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { createSignal, Show } from "solid-js"
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { ArgsProvider } from "@tui/context/args"
import { SDKProvider } from "@tui/context/sdk"

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
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
       <ThemeProvider mode="dark">
         <ArgsProvider>
           <Show when={ready()}>
             <box width={80} height={10}><text>T2_OK</text></box>
           </Show>
         </ArgsProvider>
       </ThemeProvider>
     </SDKProvider>
                </PluginRuntimeProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </KVProvider>
        </TuiStartupProvider>
      </TuiPathsProvider>
    </ExitProvider>
  ), renderer)
  
  setTimeout(() => setReady(true), 500)
  setTimeout(() => renderer.destroy?.(), 2000)
  await new Promise(r => setTimeout(r, 2500))
} catch (e) {
  const { appendFileSync } = await import("fs")
  appendFileSync("/tmp/prov-error.log", `[${"sdk"}] ERROR: ${String(e?.message ?? e)}
`)
}
