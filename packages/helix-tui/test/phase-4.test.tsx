import { App } from "../src/app"
import { RouteProvider } from "../src/context/route"
import { ThemeProvider } from "../src/context/theme"
import { SDKProvider } from "../src/context/sdk"
import { DialogProvider } from "../src/ui/dialog"
import { testRender } from "@opentui/solid"
import { createMockServer, type DecompositionScenario, type PersonaScenario, type AgentStatsScenario } from "./utils/mock-server"
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

// ── Phase 4: Decomposition + Persona + AgentStats ────────

describe("Phase 4: Decomposition + Persona + AgentStats", () => {
  let server: ReturnType<typeof createMockServer>
  let cleanupStorage: () => void

  test("4-1: dynamic decomposition required card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "decompose")
    server.setScenario({
      type: "decomposition",
      status: "required",
      subtasks: [
        { id: "t1", name: "Analyze codebase", status: "pending" },
        { id: "t2", name: "Design schema", status: "pending" },
        { id: "t3", name: "Implement API", status: "pending" },
      ],
      confidence: 0.88,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Task Decomposition") || f.includes("Analyze codebase"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Analyze codebase", "Design schema", "Implement API"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-2: dynamic persona generated card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "persona")
    server.setScenario({
      type: "persona",
      name: "Security Auditor",
      description: "Focus on security vulnerabilities and best practices",
      temporary: true,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Security Auditor") || f.includes("Dynamic Persona"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Security Auditor", "Dynamic Persona", "temporary"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-3: agent stats panel appears", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "stats")
    server.setScenario({
      type: "agentStats",
      successRate: 0.82,
      avgDuration: 3450,
      totalTasks: 47,
      level: "L1",
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Agent Stats") || f.includes("L1"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Agent Stats", "L1", "82%", "Tasks: 47"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-4: decomposition complete card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "decompose complete")
    server.setScenario({
      type: "decomposition",
      status: "complete",
      subtasks: [
        { id: "t1", name: "Analyze codebase", status: "done" },
        { id: "t2", name: "Design schema", status: "done" },
      ],
      confidence: 0.95,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("done") && f.includes("Analyze codebase"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Analyze codebase", "done"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-5: decomposition failed with error card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "decompose failed")
    server.setScenario({
      type: "decomposition",
      status: "failed",
      subtasks: [
        { id: "t1", name: "Task A", status: "error" },
      ],
      confidence: 0.3,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Task A") && f.includes("error"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Task A", "error"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-6: persona is not persisted across sessions", async () => {
    // Verify that persona does not use localStorage
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "persona")
    server.setScenario({
      type: "persona",
      name: "Test Persona",
      description: "Test desc",
      temporary: true,
    })
    const { found } = await waitForFrame(result, (f) => f.includes("Test Persona"), 15000)
    expect(found).toBe(true)

    // persona is in memory only, not in localStorage
    const stored = globalThis.localStorage?.getItem("helix-tui:persona")
    expect(stored).toBeNull()
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-7: decomposition decision with confidence", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "decompose decision")
    server.setScenario({
      type: "decomposition",
      status: "decision",
      subtasks: [
        { id: "t1", name: "Subtask 1", status: "pending" },
      ],
      confidence: 0.75,
    })

    const { found, frame } = await waitForFrame(result, (f) => f.includes("Decomposition Decision") || f.includes("Confidence"), 15000)
    expect(found).toBe(true)
    assertFrameContains(frame, ["Confidence:", "75%"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("4-8: agent stats trend updates", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "stats first")
    server.setScenario({
      type: "agentStats",
      successRate: 0.7,
      avgDuration: 4000,
      totalTasks: 10,
      level: "L0",
    })
    const { found: f1, frame: frame1 } = await waitForFrame(result, (f) => f.includes("L0"), 15000)
    expect(f1).toBe(true)

    await sendMessage(result, "stats second")
    server.setScenario({
      type: "agentStats",
      successRate: 0.9,
      avgDuration: 2000,
      totalTasks: 30,
      level: "L1",
    })
    const { found: f2, frame: frame2 } = await waitForFrame(result, (f) => f.includes("L1"), 15000)
    expect(f2).toBe(true)
    assertFrameContains(frame2, ["L1", "90%"])
    server.stop()
    cleanupStorage()
  }, 25000)
})
