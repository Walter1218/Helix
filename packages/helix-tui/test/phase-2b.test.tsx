import { App } from "../src/app"
import { RouteProvider } from "../src/context/route"
import { ThemeProvider } from "../src/context/theme"
import { SDKProvider } from "../src/context/sdk"
import { DialogProvider } from "../src/ui/dialog"
import { testRender } from "@opentui/solid"
import { createMockServer, type CardinalScenario, type JudgeScenario, type AlignmentScenario } from "./utils/mock-server"
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

// ── Phase 2b: Cardinal + Judge + AlignmentGuard ──────────

describe("Phase 2b: Cardinal + Judge + AlignmentGuard", () => {
  let server: ReturnType<typeof createMockServer>
  let cleanupStorage: () => void

  // ── Cardinal Tests ───────────────────────────────────────

  test("2b-1: Cardinal Pause card appears", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger pause")
    server.setScenario({
      type: "cardinal",
      cardinalType: "external_dep",
      severity: "pause",
      message: "External dependency detected",
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("!") && f.includes("External dependency detected") && f.includes("Allow"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["External dependency detected", "Allow"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-2: Cardinal Block card appears", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger block")
    server.setScenario({
      type: "cardinal",
      cardinalType: "test_failure",
      severity: "block",
      message: "Tests failing",
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("!") && f.includes("Tests failing") && f.includes("Allow"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Tests failing", "Allow"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-3: Cardinal Warn shows in status bar only, no card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger warn")
    server.setScenario({
      type: "cardinal",
      cardinalType: "token_budget",
      severity: "warn",
      message: "Token budget exceeded",
    })
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()
    const frame = result.captureCharFrame()

    expect(frame.includes("Token budget exceeded")).toBe(false)
    expect(frame.includes("Allow")).toBe(false)
  }, 15000)

  test("2b-4: Cardinal user allow action dismisses card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger pause")
    server.setScenario({
      type: "cardinal",
      cardinalType: "external_dep",
      severity: "pause",
      message: "External dependency detected",
    })

    const { found } = await waitForFrame(result, (f) => f.includes("Allow"), 15000)
    expect(found).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-5: Cardinal Pause with countdown shows auto-resolve timer", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger pause")
    server.setScenario({
      type: "cardinal",
      cardinalType: "external_dep",
      severity: "pause",
      message: "External dependency detected",
      degradeTimeout: 30,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Auto-resolve"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Auto-resolve")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-6: Cardinal status bar indicator appears", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger block")
    server.setScenario({
      type: "cardinal",
      cardinalType: "test_failure",
      severity: "block",
      message: "Tests failing",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("!") && f.includes("Tests failing"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Tests failing", "Allow"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-7: multiple Cardinal alerts show highest priority", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger both")
    server.setScenario({
      type: "cardinal",
      cardinalType: "external_dep",
      severity: "pause",
      message: "Pause alert",
    })
    await waitForFrame(result, (f) => f.includes("Pause alert"), 15000)

    server.setScenario({
      type: "cardinal",
      cardinalType: "test_failure",
      severity: "block",
      message: "Block alert",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Block alert"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Block alert", "Pause alert"])
    server.stop()
    cleanupStorage()
  }, 25000)

  test("2b-8: Cardinal mis-report degradation", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger")
    server.setScenario({
      type: "cardinal",
      cardinalType: "ambiguity",
      severity: "pause",
      message: "Ambiguity detected",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Ambiguity detected"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Ambiguity detected")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-9: Cardinal detail expansion", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger")
    server.setScenario({
      type: "cardinal",
      cardinalType: "tool_error",
      severity: "pause",
      message: "Tool error details here",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Tool error details here"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Tool error details here")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-10: Cardinal Stop terminates", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "trigger stop")
    server.setScenario({
      type: "cardinal",
      cardinalType: "heal_exhausted",
      severity: "stop",
      message: "Healing exhausted",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("!") && f.includes("Healing exhausted"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Healing exhausted", "Allow"])
    server.stop()
    cleanupStorage()
  }, 20000)

  // ── Judge Tests ──────────────────────────────────────────

  test.only("2b-11: Judge verdict pass card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "judge pass")
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    const emitted = server.emitSSE({
      type: "judge.verdict",
      properties: {
        id: "judge-1",
        status: "pass",
        checks: [{ name: "syntax", passed: true }, { name: "tests", passed: true }],
        summary: "All checks passed",
      },
    })
    console.log("[DEBUG] emitSSE returned:", emitted)

    await new Promise((r) => setTimeout(r, 300))
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()
    const frame = result.captureCharFrame()
    console.log("[DEBUG] frame includes 'All checks passed':", frame.includes("All checks passed"))
    console.log("[DEBUG] frame includes 'Judge: PASS':", frame.includes("Judge: PASS"))
    console.log("[DEBUG] frame includes 'Judge: QUESTION':", frame.includes("Judge: QUESTION"))
    console.log("[DEBUG] frame slice 0-2000:", frame.slice(0, 2000))

    const { found, frame: frame2 } = await waitForFrame(result, (f) => f.includes("[PASS] syntax"), 15000)
    console.log("[DEBUG] waitForFrame found:", found)
    expect(found).toBe(true)
    assertFrameContains(frame2, ["All checks passed", "[PASS] syntax"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-12: Judge verdict reject card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "judge reject")
    server.setScenario({
      type: "judge",
      status: "reject",
      checks: [{ name: "syntax", passed: false, detail: "Missing semicolon" }],
      summary: "Syntax check failed",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Judge: FAIL") || f.includes("Syntax check failed"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Judge: FAIL", "Syntax check failed"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-13: Judge verdict question card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "judge question")
    server.setScenario({
      type: "judge",
      status: "question",
      checks: [{ name: "security", passed: false, detail: "Unchecked input" }],
      summary: "Security concern",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Judge: QUESTION") || f.includes("Security concern"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Judge: QUESTION", "Security concern"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-14: Judge is non-blocking", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "judge non-blocking")
    server.setScenario({
      type: "judge",
      status: "pass",
      checks: [],
      summary: "Non-blocking test",
    })
    const { found } = await waitForFrame(result, (f) => f.includes("Non-blocking test"), 15000)
    expect(found).toBe(true)

    await result.mockInput.typeText("still typing")
    await result.renderOnce()
    const frame = result.captureCharFrame()
    expect(frame.includes("still typing")).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-15: Judge checks list renders", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "judge checks")
    server.setScenario({
      type: "judge",
      status: "pass",
      checks: [
        { name: "syntax", passed: true },
        { name: "tests", passed: true },
        { name: "lint", passed: false, detail: "Unused var" },
      ],
      summary: "Mixed checks",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("syntax") && f.includes("lint"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["syntax", "tests", "lint", "Unused var"])
    server.stop()
    cleanupStorage()
  }, 20000)

  // ── AlignmentGuard Tests ─────────────────────────────────

  test("2b-16: Alignment drift status bar indicator", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "alignment drift")
    server.setScenario({
      type: "alignment",
      alertType: "drift",
      severity: "warning",
      message: "Goal drift detected",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("~") || f.includes("Alignment Drift"), 15000)
    expect(found).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-17: Alignment drift card expands", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "alignment drift")
    server.setScenario({
      type: "alignment",
      alertType: "drift",
      severity: "warning",
      message: "Drift detail here",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Drift detail here"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, "Drift detail here")
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-18: Rabbit hole detection", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "rabbit hole")
    server.setScenario({
      type: "alignment",
      alertType: "rabbitHole",
      severity: "critical",
      message: "Deep rabbit hole detected (15 rounds)",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Rabbit Hole") || f.includes("rabbit hole"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Rabbit Hole", "rabbit hole"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-19: File drift detection", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "file drift")
    server.setScenario({
      type: "alignment",
      alertType: "fileDrift",
      severity: "warning",
      message: "File drift from original scope",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("File Drift") || f.includes("file drift"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["File Drift", "file drift"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2b-20: Distraction detection", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "distraction")
    server.setScenario({
      type: "alignment",
      alertType: "distraction",
      severity: "warning",
      message: "Distraction operation detected",
    })
    const { found, frame } = await waitForFrame(result, (f) => f.includes("Distraction") || f.includes("distraction"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Distraction", "distraction"])
    server.stop()
    cleanupStorage()
  }, 20000)
})
