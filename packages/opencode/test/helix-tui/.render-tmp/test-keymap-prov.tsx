import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { ClipboardProvider } from "@tui/context/clipboard"
import { Show, createSignal } from "solid-js"

// Create a minimal keymap stub
const fakeKeymap = {} as any

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
          <ClipboardProvider>
            <KVProvider>
              <RouteProvider>
                <TuiConfigProvider config={{}}>
                  <PluginRuntimeProvider value={createPluginRuntime()}>
                    <ThemeProvider mode="dark">
                      <Show when={ready()}>
                        <box width={80} height={10}><text>KP_TEST_OK</text></box>
                      </Show>
                    </ThemeProvider>
                  </PluginRuntimeProvider>
                </TuiConfigProvider>
              </RouteProvider>
            </KVProvider>
          </ClipboardProvider>
        </TuiStartupProvider>
      </TuiPathsProvider>
    </ExitProvider>
  ), renderer)
} catch(e) { 
  console.error("KP ERROR:", (e as any)?.message ?? String(e))
  process.exit(1)
}
setTimeout(() => setReady(true), 500)
setTimeout(() => renderer.destroy?.(), 2000)
await new Promise(r => setTimeout(r, 2500))
console.error("KP OK")
