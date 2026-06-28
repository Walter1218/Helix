
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
import { ToastProvider } from "@tui/ui/toast"
import { EditorContextProvider } from "@tui/context/editor"
import { LocationProvider } from "@tui/context/location"

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
               <ToastProvider>
                 <PromptRefProvider>
                   <PromptStashProvider>
                     <DialogProvider>
                       <FrecencyProvider>
                         <PromptHistoryProvider>
                           <ArgsProvider>
                             <LocalProvider>
                               <EditorContextProvider>
                                 <LocationProvider>
                                   <Show when={ready()}>
                                     <box width={80} height={10}><text>T5_OK</text></box>
                                   </Show>
                                 </LocationProvider>
                               </EditorContextProvider>
                             </LocalProvider>
                           </ArgsProvider>
                         </PromptHistoryProvider>
                       </FrecencyProvider>
                     </DialogProvider>
                   </PromptStashProvider>
                 </PromptRefProvider>
               </ToastProvider>
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
  appendFileSync("/tmp/prov-error.log", `[${"toast-editor"}] ERROR: ${String(e?.message ?? e)}
`)
}
