
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
import { SyncProvider } from "@tui/context/sync"
import { DataProvider } from "@tui/context/data"
import { ProjectProvider } from "@tui/context/project"
import { LocalProvider } from "@tui/context/local"
import { PromptRefProvider } from "@tui/context/prompt"
import { PromptStashProvider } from "@tui/component/prompt/stash"
import { DialogProvider } from "@tui/ui/dialog"
import { FrecencyProvider } from "@tui/component/prompt/frecency"
import { PromptHistoryProvider } from "@tui/component/prompt/history"

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
                             <Show when={ready()}>
                               <box width={80} height={10}><text>T4_OK</text></box>
                             </Show>
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
          </KVProvider>
        </TuiStartupProvider>
      </TuiPathsProvider>
    </ExitProvider>
  ), renderer)
  
  setTimeout(() => setReady(true), 500)
  setTimeout(() => renderer.destroy?.(), 3000)
  await new Promise(r => setTimeout(r, 3500))
} catch (e) {
  const { appendFileSync } = await import("fs")
  appendFileSync("/tmp/prov-error.log", `[${"prompts"}] ERROR: ${String(e?.message ?? e)}
`)
}
