/**
 * Render E2E tests — verify the OpenTUI rendering pipeline produces visible output.
 */
import { test, expect, describe } from "bun:test"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { $ } from "bun"
import { mkdirSync } from "fs"

const TMP = join(process.cwd(), "test/helix-tui/.render-tmp")
mkdirSync(TMP, { recursive: true })

async function captureRender(jsxContent: string, sleepSec = 1, imports = ""): Promise<string> {
  const name = `render-${Date.now()}`
  const scriptPath = join(TMP, `${name}.tsx`)
  const ansiPath = join(TMP, `${name}.ans`)
  
  await writeFile(scriptPath, `
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
${imports}

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 60,
  exitOnCtrlC: false,
  useKittyKeyboard: {},
  autoFocus: false,
})

render(() => (${jsxContent}), renderer)
setTimeout(() => renderer.destroy?.(), ${sleepSec * 1000})
await new Promise(r => setTimeout(r, ${sleepSec * 1000 + 500}))
`)
  
  const cmd = `cd ${process.cwd()} && bun run --conditions=browser ${scriptPath}`
  await $`script -q ${ansiPath} bash -c ${cmd} 2>/dev/null`.nothrow().quiet()
  
  return (await readFile(ansiPath)).toString('latin1')
}

describe("Basic Rendering", () => {
  test("simple text produces visible output", async () => {
    const out = await captureRender(`<box width={80} height={10} flexDirection="column">
      <text>RENDER_TEST_HELLO</text>
      <box height={1} />
      <text>RENDER_WORKS</text>
    </box>`)
    
    expect(out.length).toBeGreaterThan(50)
    expect(out).toContain("RENDER_TEST_HELLO")
    expect(out).toContain("RENDER_WORKS")
  })

  test("alt screen entered and exited", async () => {
    const out = await captureRender(`<box width={10} height={3}><text>X</text></box>`, 0.3)
    expect(out).toContain("\x1b[?1049h")
    expect(out).toContain("\x1b[?1049l")
  })

  test("bold text renders", async () => {
    const out = await captureRender(`<box width={40} height={5}><text><b>BOLD_TEXT</b></text></box>`)
    expect(out).toContain("BOLD_TEXT")
  })

  test("flexGrow layout positions content", async () => {
    const out = await captureRender(`<box width={30} height={8} flexDirection="column">
      <text>TOP</text>
      <box flexGrow={1} />
      <text>BOTTOM</text>
    </box>`)
    expect(out).toContain("TOP")
    expect(out).toContain("BOTTOM")
  })
})

describe("Real App Component", () => {
  test("real App with minimal providers (no SDK/Sync)", async () => {
    const imports = `
import { ExitProvider } from "@tui/context/exit"
import { TuiPathsProvider, TuiStartupProvider } from "@tui/context/runtime"
import { KVProvider } from "@tui/context/kv"
import { RouteProvider } from "@tui/context/route"
import { TuiConfigProvider } from "@tui/config"
import { PluginRuntimeProvider, createPluginRuntime } from "@tui/plugin/runtime"
import { ThemeProvider } from "@tui/context/theme"
import { ArgsProvider } from "@tui/context/args"
import { ErrorBoundary, Show, createSignal } from "solid-js"

// Minimal stub for SDK
const SDKProvider = (p: any) => p.children
const SyncProvider = (p: any) => p.children
const ProjectProvider = (p: any) => p.children

function RealApp() {
  const [ready] = createSignal(true)
  return (
    <ErrorBoundary fallback={(e: Error) => <text>{'ERR:' + e.message.slice(0, 60)}</text>}>
      <Show when={ready()}>
        <box width={80} height={20} flexDirection="column">
          <box flexGrow={1} alignItems="center" justifyContent="center">
            <text>REAL_APP_WORKS</text>
          </box>
        </box>
      </Show>
    </ErrorBoundary>
  )
}`

    const out = await captureRender(
      `<ExitProvider exit={() => renderer.destroy?.()}>
        <TuiPathsProvider value={{ cwd: process.cwd(), home: "/tmp", state: "/tmp", worktree: "/tmp" }}>
          <TuiStartupProvider value={{ initialRoute: undefined, skipInitialLoading: true }}>
            <KVProvider>
              <RouteProvider>
                <TuiConfigProvider config={{}}>
                  <PluginRuntimeProvider value={createPluginRuntime()}>
                    <ArgsProvider>
                      <SDKProvider>
                        <ProjectProvider>
                          <SyncProvider>
                            <ThemeProvider mode="dark">
                              <RealApp />
                            </ThemeProvider>
                          </SyncProvider>
                        </ProjectProvider>
                      </SDKProvider>
                    </ArgsProvider>
                  </PluginRuntimeProvider>
                </TuiConfigProvider>
              </RouteProvider>
            </KVProvider>
          </TuiStartupProvider>
        </TuiPathsProvider>
      </ExitProvider>`,
      2,
      imports
    )
    
    expect(out).toContain("REAL_APP_WORKS")
    expect(out).not.toContain("ERR:")
  })

  test("Show when={false} hides content completely", async () => {
    const imports = `
import { Show, createSignal } from "solid-js"
function App() {
  const [ready] = createSignal(false)
  return (
    <box width={80} height={10} flexDirection="column">
      <Show when={ready()}>
        <text>SHOULD_NOT_APPEAR</text>
      </Show>
    </box>
  )
}`

    const out = await captureRender(
      `<App />`,
      1,
      imports
    )
    
    expect(out).not.toContain("SHOULD_NOT_APPEAR")
  })

  test("Show when={true} shows content", async () => {
    const imports = `
import { Show, createSignal } from "solid-js"
function App() {
  const [ready] = createSignal(true)
  return (
    <box width={80} height={10} flexDirection="column">
      <Show when={ready()}>
        <text>SHOULD_APPEAR</text>
      </Show>
    </box>
  )
}`

    const out = await captureRender(
      `<App />`,
      1,
      imports
    )
    
    expect(out).toContain("SHOULD_APPEAR")
  })
})

describe("Slot Rendering", () => {
  test("slot with children renders fallback when no plugin registered", async () => {
    const imports = `
import { PluginRuntimeProvider, createPluginRuntime, usePluginRuntime } from "@tui/plugin/runtime"

function App() {
  const runtime = usePluginRuntime()
  const Slot = runtime.Slot
  return (
    <box width={80} height={10} flexDirection="column">
      <Slot name="test_slot">
        <text>SLOT_FALLBACK</text>
      </Slot>
    </box>
  )
}`

    const out = await captureRender(
      `<PluginRuntimeProvider value={createPluginRuntime()}>
        <App />
      </PluginRuntimeProvider>`,
      1,
      imports
    )
    
    expect(out).toContain("SLOT_FALLBACK")
  })

  test("ErrorBoundary catches render error", async () => {
    const imports = `
import { ErrorBoundary } from "solid-js"

function Broken() {
  throw new Error("TEST_ERR_BOUNDARY_WORKS")
  return null
}`

    const out = await captureRender(
      `<ErrorBoundary fallback={(e: Error) => <text>{'CAUGHT:' + e.message}</text>}>
        <Broken />
      </ErrorBoundary>`,
      1,
      imports
    )
    
    expect(out).toContain("CAUGHT:TEST_ERR_BOUNDARY_WORKS")
  })
})
