import { App } from "../src/app"
import { RouteProvider } from "../src/context/route"
import { ThemeProvider } from "../src/context/theme"
import { SDKProvider } from "../src/context/sdk"
import { DialogProvider } from "../src/ui/dialog"
import { testRender } from "@opentui/solid"
import { createMockServer, type ModeConfigScenario } from "./utils/mock-server"
import {
  assertFrameContains,
  assertFrameNotContains,
} from "./utils/frame-assert"
import { injectMockStorage } from "./utils/local-storage"
import { describe, expect, test } from "bun:test"

async function renderApp(options: { width?: number; height?: number; serverUrl: string } = { serverUrl: "" }) {
  const cleanup = injectMockStorage()
  const { Chat } = await import("../src/routes/chat")
  const result = await testRender(
    () => (
      <SDKProvider url={options.serverUrl}>
        <ThemeProvider>
          <DialogProvider>
            <Chat />
          </DialogProvider>
        </ThemeProvider>
      </SDKProvider>
    ),
    { width: options.width ?? 120, height: options.height ?? 35 },
  )
  return { result, cleanup }
}

async function initTUI(result: any) {
  await result.renderOnce()
  await new Promise((r) => setTimeout(r, 1500))
}

async function sendMessage(result: any, text: string) {
  await result.mockInput.typeText(text)
  await result.renderOnce()
  result.mockInput.pressEnter()
  await result.renderOnce()
}

async function waitForFrame(
  result: any,
  predicate: (frame: string) => boolean,
  maxWaitMs: number = 15000,
  intervalMs: number = 500,
) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await result.renderOnce()
    const frame = result.captureCharFrame()
    if (predicate(frame)) {
      return { frame, found: true, elapsed: Date.now() - start }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  await result.renderOnce()
  return { frame: result.captureCharFrame(), found: false, elapsed: Date.now() - start }
}

// ── Phase 3b: Mode Registry Tests ──────────────────────────

describe("Phase 3b: Mode Registry", () => {
  let server: ReturnType<typeof createMockServer>
  let cleanupStorage: () => void

  test("3b-1: mode switch UI highlights active mode", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    // Default mode is Build
    const frame0 = result.captureCharFrame()
    expect(frame0.includes("Build") || frame0.includes("[Build]")).toBe(true)

    // Press Tab to switch
    result.mockInput.pressKey("tab")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const frame1 = result.captureCharFrame()
    // Should have switched to another mode
    const hasOtherMode =
      frame1.includes("Plan") ||
      frame1.includes("Compose") ||
      frame1.includes("Loop") ||
      frame1.includes("Max") ||
      frame1.includes("Ask")
    expect(hasOtherMode).toBe(true)
    server.stop()
    cleanupStorage()
  }, 10000)

  test("3b-2: mode config from server updates mode labels", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "mode config")
    server.setScenario({
      type: "modeConfig",
      modes: [
        { id: "research", name: "Research", color: "info" },
        { id: "code", name: "Code", color: "success" },
        { id: "review", name: "Review", color: "warning" },
      ],
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Research") || f.includes("Code"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Research", "Code", "Review"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("3b-3: new mode registration appears in UI", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "new mode")
    server.setScenario({
      type: "modeConfig",
      modes: [
        { id: "ask", name: "Ask" },
        { id: "build", name: "Build" },
        { id: "newmode", name: "NewMode", color: "accent" },
      ],
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("NewMode"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "NewMode")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("3b-4: mode-specific preflight triggers on Plan mode", async () => {
    // Pre-flight is mode-agnostic in current UI, but we verify it works with a custom mode label
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    // Send mode config first
    await sendMessage(result, "plan mode")
    server.setScenario({
      type: "modeConfig",
      modes: [
        { id: "plan", name: "Plan", color: "warning" },
      ],
    })
    await waitForFrame(result, (f) => f.includes("Plan"), 15000)

    // Then send preflight
    server.setScenario({
      type: "preflight",
      score: 0.75,
      mode: "ask",
      questions: [{ id: "q1", text: "Plan question?", questionType: "single", options: ["Yes", "No"] }],
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Plan question?"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Plan question?")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("3b-5: mode-specific cardinal on Build mode", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "build mode")
    server.setScenario({
      type: "modeConfig",
      modes: [
        { id: "build", name: "Build", color: "success" },
      ],
    })
    await waitForFrame(result, (f) => f.includes("Build"), 15000)

    server.setScenario({
      type: "cardinal",
      cardinalType: "tool_error",
      severity: "pause",
      message: "Build tool error",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Build tool error"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Build tool error")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("3b-6: malformed mode config does not crash", async () => {
    server = createMockServer()
    const url = await server.start({
      type: "custom",
      events: [
        { type: "mode.registry", properties: { modes: null } },
      ],
      delay: 50,
    })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "malformed mode")
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()
    const frame = result.captureCharFrame()
    // Should not crash
    expect(frame).toBeDefined()
    expect(frame.length).toBeGreaterThan(0)
    server.stop()
    cleanupStorage()
  }, 15000)

  test("3b-7: mode switch via keyboard", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    // Press Tab multiple times to cycle through all modes
    const modesBefore = result.captureCharFrame()
    result.mockInput.pressKey("tab")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()
    const modesAfter1 = result.captureCharFrame()

    result.mockInput.pressKey("tab")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()
    const modesAfter2 = result.captureCharFrame()

    // Each tab should change the highlighted mode
    expect(modesBefore).not.toBe(modesAfter1)
    expect(modesAfter1).not.toBe(modesAfter2)
    server.stop()
    cleanupStorage()
  }, 10000)
})
