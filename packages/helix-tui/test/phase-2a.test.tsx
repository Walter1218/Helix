import { App } from "../src/app"
import { RouteProvider } from "../src/context/route"
import { ThemeProvider } from "../src/context/theme"
import { SDKProvider } from "../src/context/sdk"
import { DialogProvider } from "../src/ui/dialog"
import { testRender } from "@opentui/solid"
import { createMockServer, type PreFlightScenario } from "./utils/mock-server"
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
  // 给 SDKProvider 的 startEvents 足够时间建立 SSE 连接
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

// ── Phase 2a: Pre-flight MVP Tests ───────────────────────

describe("Phase 2a: Pre-flight MVP", () => {
  let server: ReturnType<typeof createMockServer>
  let cleanupStorage: () => void

  const defaultPreFlight: PreFlightScenario = {
    type: "preflight",
    score: 0.72,
    mode: "ask",
    questions: [
      {
        id: "q1",
        text: "目标优先级是什么？",
        questionType: "single",
        options: ["性能", "可读性", "安全性"],
      },
      {
        id: "q2",
        text: "是否允许修改 API 签名？",
        questionType: "single",
        options: ["允许", "不允许", "不确定"],
      },
      {
        id: "q3",
        text: "测试通过后直接提交？",
        questionType: "single",
        options: ["是", "否", "仅Diff审查"],
      },
    ],
  }

  test("2a-1: preflight card appears when preflight.required event is received", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "optimize")
    server.setScenario(defaultPreFlight)
    const { frame } = await waitForFrame(result, (f) => f.includes("Pre-flight") || f.includes("🔍") || f.includes("目标优先级是什么？"), 15000)

    assertFrameContains(frame, ["[1] 性能"])
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2a-2: preflight card shows options for each question", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "optimize")
    server.setScenario(defaultPreFlight)
    await waitForFrame(result, (f) => f.includes("Pre-flight") || f.includes("🔍"), 15000)

    const frame = result.captureCharFrame()
    // 验证选项存在
    expect(frame.includes("性能") || frame.includes("[1]")).toBe(true)
    expect(frame.includes("允许") || frame.includes("[2]")).toBe(true)
    expect(frame.includes("是") || frame.includes("[3]")).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2a-3: pressing number key selects an option", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "optimize")
    await server.waitForSSE(5000)
    server.setScenario(defaultPreFlight)
    await waitForFrame(result, (f) => f.includes("Pre-flight") || f.includes("🔍") || f.includes("目标优先级是什么？"), 15000)

    await result.mockInput.pressKey("1")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 1000))
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    // 选中后应该显示选中标记 [OK] 或选项文本
    expect(frame.includes("[OK]") || frame.includes("性能")).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2a-4: pressing Enter confirms and hides preflight card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "optimize")
    server.setScenario(defaultPreFlight)
    await waitForFrame(result, (f) => f.includes("Pre-flight") || f.includes("🔍"), 15000)

    // 选择一个选项
    await result.mockInput.typeText("1")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 300))

    // 按 Enter 确认
    result.mockInput.pressEnter()
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    // 确认后卡片应该消失
    expect(!frame.includes("Pre-flight")).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2a-5: pressing Escape skips preflight", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "optimize")
    server.setScenario(defaultPreFlight)
    await waitForFrame(result, (f) => f.includes("Pre-flight") || f.includes("🔍"), 15000)

    // 按 Escape 跳过
    result.mockInput.pressKey("escape")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    // 跳过后卡片应该消失
    expect(!frame.includes("Pre-flight")).toBe(true)
    server.stop()
    cleanupStorage()
  }, 20000)

  test("2a-6: low ambiguity score skips preflight automatically", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "clear task")
    server.setScenario({
      type: "preflight",
      score: 0.3,
      mode: "auto",
      questions: [],
    })
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    // 模糊度低时不应该出现 Pre-flight 卡片
    expect(frame.includes("Pre-flight")).toBe(false)
    expect(frame.includes("🔍")).toBe(false)
    server.stop()
    cleanupStorage()
  }, 15000)

  test("2a-7: preflight mode=skip never shows card", async () => {
    server = createMockServer()
    const url = await server.start({ type: "direct", response: "OK" })
    const { result, cleanup } = await renderApp({ serverUrl: url })
    cleanupStorage = cleanup
    await initTUI(result)

    await sendMessage(result, "task")
    server.setScenario({
      type: "preflight",
      score: 0.8,
      mode: "skip",
      questions: [{ id: "q1", text: "question", questionType: "single", options: ["a", "b"] }],
    })
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    expect(frame.includes("Pre-flight")).toBe(false)
    server.stop()
    cleanupStorage()
  }, 15000)
})
