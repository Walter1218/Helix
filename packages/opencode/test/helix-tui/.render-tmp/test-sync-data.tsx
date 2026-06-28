import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { SDKProvider } from "@tui/context/sdk"
import { SyncProvider } from "@tui/context/sync"
import { DataProvider } from "@tui/context/data"
import { Show, createSignal } from "solid-js"

for (const combo of [
  ["Sync+Data", [SyncProvider, DataProvider]],
  ["Proj+Data", [ProjectProvider, DataProvider]],
]) {
  const [name, providers] = combo
  const renderer = await createCliRenderer({
    externalOutputMode: "passthrough", targetFps: 60,
    exitOnCtrlC: false, useKittyKeyboard: {}, autoFocus: false,
    openConsoleOnError: false,
  })
  const [ready, setReady] = createSignal(false)
  try {
    const Inner = providers[providers.length-1]
    let tree
    if (providers.length === 1) {
      tree = <Inner><ThemeProvider mode="dark"><Show when={ready()}><box width={80} height={10}><text>OK_{name}</text></box></Show></ThemeProvider></Inner>
    } else {
      const [First, Second] = providers
      tree = <First><Second><ThemeProvider mode="dark"><Show when={ready()}><box width={80} height={10}><text>OK_{name}</text></box></Show></ThemeProvider></Second></First>
    }
    render(() => (
      <ExitProvider exit={() => renderer.destroy?.()}>
        <TuiPathsProvider value={{ cwd: process.cwd(), home: "/tmp", state: "/tmp", worktree: "/tmp" }}>
          <TuiStartupProvider value={{ initialRoute: undefined, skipInitialLoading: true }}>
            <KVProvider><RouteProvider><TuiConfigProvider config={{}}>
              <PluginRuntimeProvider value={createPluginRuntime()}>
                <SDKProvider url="" directory="/tmp">
                  {tree}
                </SDKProvider>
              </PluginRuntimeProvider>
            </TuiConfigProvider></RouteProvider></KVProvider>
          </TuiStartupProvider>
        </TuiPathsProvider>
      </ExitProvider>
    ), renderer)
  } catch(e) { 
    console.error(name, "ERROR:", (e as any)?.message ?? String(e))
    continue
  }
  setTimeout(() => setReady(true), 500)
  setTimeout(() => renderer.destroy?.(), 3000)
  await new Promise(r => setTimeout(r, 3500))
  console.error(name, "OK")
}
