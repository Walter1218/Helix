/**
 * Progressive provider test — starts minimal and adds providers until failure.
 */
import { test, expect } from "bun:test"
import { readFile, writeFile, appendFileSync } from "fs/promises"
import { join } from "path"
import { $ } from "bun"
import { mkdirSync, appendFileSync as appendSync } from "fs"

const TMP = join(process.cwd(), "test/helix-tui/.render-tmp")
mkdirSync(TMP, { recursive: true })

async function runTest(label: string, providers: string, imports: string, jsx: string, sleepSec = 3): Promise<string> {
  const name = `prov-${label.replace(/\s+/g,'-')}-${Date.now()}`
  const scriptPath = join(TMP, `${name}.tsx`)
  const ansiPath = join(TMP, `${name}.ans`)
  
  await writeFile(scriptPath, `
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
${imports}

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
                  ${providers}
                </PluginRuntimeProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </KVProvider>
        </TuiStartupProvider>
      </TuiPathsProvider>
    </ExitProvider>
  ), renderer)
  
  setTimeout(() => setReady(true), 500)
  setTimeout(() => renderer.destroy?.(), ${sleepSec * 1000})
  await new Promise(r => setTimeout(r, ${sleepSec * 1000 + 500}))
} catch (e) {
  const { appendFileSync } = await import("fs")
  appendFileSync("/tmp/prov-error.log", \`[\${"${label}"}] ERROR: \${String(e?.message ?? e)}\n\`)
}
`)
  
  // Run, capture, return ANSI
  const cmd = `cd ${process.cwd()} && bun run --conditions=browser ${scriptPath}`
  await $`script -q ${ansiPath} bash -c ${cmd} 2>/dev/null`.nothrow().quiet()
  
  return (await readFile(ansiPath)).toString('latin1')
}

test("Provider 1: base only", async () => {
  const out = await runTest("base", 
    `<ThemeProvider mode="dark">
       <ArgsProvider>
         <Show when={ready()}>
           <box width={80} height={10}><text>T1_OK</text></box>
         </Show>
       </ArgsProvider>
     </ThemeProvider>`,
    ``,
    ``,
    2
  )
  expect(out).toContain("T1_OK")
})

test("Provider 2: +SDK", async () => {
  const out = await runTest("sdk",
    `<SDKProvider url="" directory="/tmp">
       <ThemeProvider mode="dark">
         <ArgsProvider>
           <Show when={ready()}>
             <box width={80} height={10}><text>T2_OK</text></box>
           </Show>
         </ArgsProvider>
       </ThemeProvider>
     </SDKProvider>`,
    `import { SDKProvider } from "@tui/context/sdk"`,
    ``,
    2
  )
  expect(out).toContain("T2_OK")
})

test("Provider 3: +Sync+Project+Data", async () => {
  const out = await runTest("sync-proj-data",
    `<SDKProvider url="" directory="/tmp">
       <ProjectProvider>
         <SyncProvider>
           <DataProvider>
             <ThemeProvider mode="dark">
               <ArgsProvider>
                 <Show when={ready()}>
                   <box width={80} height={10}><text>T3_OK</text></box>
                 </Show>
               </ArgsProvider>
             </ThemeProvider>
           </DataProvider>
         </SyncProvider>
       </ProjectProvider>
     </SDKProvider>`,
    `import { SDKProvider } from "@tui/context/sdk"
import { SyncProvider } from "@tui/context/sync"
import { DataProvider } from "@tui/context/data"
import { ProjectProvider } from "@tui/context/project"`,
    ``,
    3
  )
  expect(out).toContain("T3_OK")
})

test("Provider 4: +Local+Prompt+Dialog+Frecency+History", async () => {
  const out = await runTest("prompts",
    `<SDKProvider url="" directory="/tmp">
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
     </SDKProvider>`,
    `import { SDKProvider } from "@tui/context/sdk"
import { SyncProvider } from "@tui/context/sync"
import { DataProvider } from "@tui/context/data"
import { ProjectProvider } from "@tui/context/project"
import { LocalProvider } from "@tui/context/local"
import { PromptRefProvider } from "@tui/context/prompt"
import { PromptStashProvider } from "@tui/component/prompt/stash"
import { DialogProvider } from "@tui/ui/dialog"
import { FrecencyProvider } from "@tui/component/prompt/frecency"
import { PromptHistoryProvider } from "@tui/component/prompt/history"`,
    ``,
    3
  )
  expect(out).toContain("T4_OK")
})

test("Provider 5: +Toast+Editor+Location", async () => {
  const out = await runTest("toast-editor",
    `<SDKProvider url="" directory="/tmp">
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
     </SDKProvider>`,
    `import { SDKProvider } from "@tui/context/sdk"
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
import { LocationProvider } from "@tui/context/location"`,
    ``,
    3
  )
  expect(out).toContain("T5_OK")
})
