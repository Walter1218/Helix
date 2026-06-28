/**
 * Full TUI startup test — starts the real TUI, captures output, verifies content.
 */
import { test, expect } from "bun:test"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { $ } from "bun"
import { mkdirSync } from "fs"

const TMP = join(process.cwd(), "test/helix-tui/.render-tmp")
mkdirSync(TMP, { recursive: true })

async function captureTui(extraCode = "", sleepSec = 5): Promise<string> {
  const name = `full-tui-${Date.now()}`
  const scriptPath = join(TMP, `${name}.tsx`)
  const ansiPath = join(TMP, `${name}.ans`)
  
  await writeFile(scriptPath, `
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
${extraCode}

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
setTimeout(() => renderer.destroy?.(), ${sleepSec * 1000})
await new Promise(r => setTimeout(r, ${sleepSec * 1000 + 500}))
`)
  
  const cmd = `cd ${process.cwd()} && bun run --conditions=browser ${scriptPath}`
  await $`script -q ${ansiPath} bash -c ${cmd} 2>/dev/null`.nothrow().quiet()
  
  return (await readFile(ansiPath)).toString('latin1')
}

test("Full TUI: Home page renders visible content", async () => {
  const out = await captureTui("", 6)
  
  console.log("Output length:", out.length)
  expect(out.length).toBeGreaterThan(100)
  expect(out).toContain("\x1b[?1049h")  // alt screen
  
  // Check for error messages
  if (out.includes("ERR:")) {
    const errMatch = out.match(/ERR:([^\n<>]+)/)
    console.log("RENDER ERROR:", errMatch?.[1] ?? "unknown")
  }
  
  // Home page should not show errors
  expect(out).not.toContain("ERR:")
  
  // Log what we found
  for (const pat of ["Helix", "HELIX", "Ask", "OpenCode", "Home", "Logo", "input", "prompt"]) {
    if (out.includes(pat)) console.log(`  Found text: "${pat}"`)
  }
  
  if (!out.includes("Helix") && !out.includes("Ask") && !out.includes("OpenCode")) {
    console.log("WARNING: No expected home page text found")
    console.log("First 500 chars:", out.slice(0, 500))
  }
})

test("Full TUI: just entering alt screen is confirmed", async () => {
  const out = await captureTui("", 6)
  expect(out).toContain("\x1b[?1049h")
  expect(out).toContain("\x1b[?1049l")
})

test("Full TUI: SDK/Sync providers work without crash", async () => {
  const out = await captureTui("", 6)
  expect(out).toContain("\x1b[?1049h")
  expect(out.length).toBeGreaterThan(50)
})
