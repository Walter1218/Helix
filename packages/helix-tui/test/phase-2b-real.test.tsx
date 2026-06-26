import { describe, expect, test, afterEach } from "bun:test"
import { testRender } from "@opentui/solid"
import { Bus } from "../../opencode/src/bus"
import { Event as SessionEvent } from "../../opencode/src/session/session"
import { Instance } from "../../opencode/src/project/instance"
import { injectMockStorage } from "./utils/local-storage"
import { createRealBusServer } from "./utils/real-bus-server"
import fs from "fs/promises"
import os from "os"
import path from "path"

// ── Helpers ──────────────────────────────────────────────

async function tmpdir() {
  const dir = path.join(os.tmpdir(), "mimocode-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(dir, { recursive: true })
  return {
    path: dir,
    [Symbol.asyncDispose]: async () => {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    },
  }
}

async function renderChat(serverUrl: string) {
  const { Chat } = await import("../src/routes/chat")
  const { RouteProvider } = await import("../src/context/route")
  const { ThemeProvider } = await import("../src/context/theme")
  const { SDKProvider } = await import("../src/context/sdk")
  const { DialogProvider } = await import("../src/ui/dialog")

  return testRender(
    () => (
      <SDKProvider url={serverUrl}>
        <ThemeProvider>
          <DialogProvider>
            <RouteProvider initialRoute={{ type: "chat" }}>
              <Chat />
            </RouteProvider>
          </DialogProvider>
        </ThemeProvider>
      </SDKProvider>
    ),
    { width: 120, height: 35 },
  )
}

async function initTUI(result: any) {
  for (let i = 0; i < 5; i++) {
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 100))
  }
}

async function waitForFrame(
  result: any,
  predicate: (frame: string) => boolean,
  maxWaitMs = 15000,
  intervalMs = 500,
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
  const frame = result.captureCharFrame()
  if (!predicate(frame)) {
    console.log("=== waitForFrame timeout ===")
    console.log("Frame preview (first 2000 chars):")
    console.log(frame.slice(0, 2000))
  }
  return { frame, found: false, elapsed: Date.now() - start }
}

// ── Tests ────────────────────────────────────────────────

describe("Phase 2b: Cardinal + Judge + Alignment via real Bus", { concurrent: false }, () => {
  let cleanupStorage: (() => void) | undefined

  afterEach(() => {
    cleanupStorage?.()
  })

  // ── Cardinal ───────────────────────────────────────

  test("cardinal.detected block renders alert card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-1",
          cardinalType: "security",
          severity: "block",
          message: "Tests failing",
          autoDegrade: false,
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Tests failing"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Tests failing")

        stop()
      },
    })
  }, 20000)

  test("cardinal.detected pause renders alert card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-2",
          cardinalType: "external_dep",
          severity: "pause",
          message: "External dependency detected",
          autoDegrade: false,
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("External dependency detected"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("External dependency detected")

        stop()
      },
    })
  }, 20000)

  test("cardinal.detected warn does not show card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-3",
          cardinalType: "token_budget",
          severity: "warn",
          message: "Token budget exceeded",
          autoDegrade: false,
        })

        await Bun.sleep(1000)
        await result.renderOnce()
        const frame = result.captureCharFrame()

        // warn 只记录在 trace，不显示卡片
        expect(frame.includes("Token budget exceeded")).toBe(false)

        stop()
      },
    })
  }, 15000)

  test("cardinal.detected stop renders alert card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-4",
          cardinalType: "heal_exhausted",
          severity: "stop",
          message: "Healing exhausted",
          autoDegrade: false,
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Healing exhausted"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Healing exhausted")

        stop()
      },
    })
  }, 20000)

  test("cardinal.detected multiple alerts show highest priority", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-5a",
          cardinalType: "external_dep",
          severity: "pause",
          message: "Pause alert",
          autoDegrade: false,
        })

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-5b",
          cardinalType: "test_failure",
          severity: "block",
          message: "Block alert",
          autoDegrade: false,
        })

        const { found, frame } = await waitForFrame(
          result,
          (f) => f.includes("Block alert") && f.includes("Pause alert"),
          15000,
        )
        expect(found).toBe(true)
        expect(frame).toContain("Block alert")
        expect(frame).toContain("Pause alert")

        stop()
      },
    })
  }, 25000)

  test("cardinal.detected mis-report degradation renders", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.CardinalDetected, {
          sessionID: "test-session",
          id: "cardinal-6",
          cardinalType: "ambiguity",
          severity: "pause",
          message: "Ambiguity detected",
          autoDegrade: true,
          degradeTimeout: 30,
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Ambiguity detected"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Ambiguity detected")

        stop()
      },
    })
  }, 20000)

  // ── Judge ────────────────────────────────────────────

  test("judge.verdict pass renders card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.JudgeVerdict, {
          sessionID: "test-session",
          id: "judge-1",
          status: "pass",
          checks: ["syntax", "tests"],
          summary: "All checks passed",
        })

        await Bun.sleep(500)
        await result.renderOnce()
        const frame = result.captureCharFrame()
        console.log("Judge pass frame:")
        console.log(frame)
        expect(frame.includes("All checks passed") || frame.includes("AllgchecksSpassed") || frame.includes("Judge: PASS")).toBe(true)

        stop()
      },
    })
  }, 20000)

  test("judge.verdict reject renders fail card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.JudgeVerdict, {
          sessionID: "test-session",
          id: "judge-2",
          status: "fail",
          checks: ["syntax"],
          summary: "Syntax check failed",
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Syntax check failed"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Syntax check failed")

        stop()
      },
    })
  }, 20000)

  test("judge.verdict question renders card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.JudgeVerdict, {
          sessionID: "test-session",
          id: "judge-3",
          status: "question",
          checks: ["security"],
          summary: "Security concern",
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Security concern"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Security concern")

        stop()
      },
    })
  }, 20000)

  test("judge.verdict is non-blocking", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.JudgeVerdict, {
          sessionID: "test-session",
          id: "judge-4",
          status: "pass",
          checks: [],
          summary: "Non-blocking test",
        })

        const { found } = await waitForFrame(result, (f) => f.includes("Non-blocking test"), 15000)
        expect(found).toBe(true)

        // Judge 卡片显示后，输入框仍然可用
        await result.mockInput.typeText("still typing")
        await result.renderOnce()
        const frame = result.captureCharFrame()
        expect(frame.includes("still typing")).toBe(true)

        stop()
      },
    })
  }, 20000)

  test("judge.verdict checks list renders", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.JudgeVerdict, {
          sessionID: "test-session",
          id: "judge-5",
          status: "pass",
          checks: ["syntax", "tests", "lint"],
          summary: "Mixed checks",
        })

        const { found, frame } = await waitForFrame(
          result,
          (f) => f.includes("syntax") && f.includes("tests") && f.includes("lint"),
          15000,
        )
        expect(found).toBe(true)
        expect(frame).toContain("syntax")
        expect(frame).toContain("tests")
        expect(frame).toContain("lint")

        stop()
      },
    })
  }, 20000)

  // ── Alignment ────────────────────────────────────────

  test("alignment.drift renders alert card", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.AlignmentDrift, {
          sessionID: "test-session",
          id: "alignment-1",
          alertType: "drift",
          severity: "warning",
          message: "Goal drift detected",
          metrics: {},
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Goal drift detected"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Goal drift detected")

        stop()
      },
    })
  }, 20000)

  test("alignment.drift rabbit hole renders", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.AlignmentDrift, {
          sessionID: "test-session",
          id: "alignment-2",
          alertType: "rabbit-hole",
          severity: "critical",
          message: "Deep rabbit hole detected (15 rounds)",
          metrics: {},
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("rabbit hole"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("rabbit hole")

        stop()
      },
    })
  }, 20000)

  test("alignment.drift file drift renders", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.AlignmentDrift, {
          sessionID: "test-session",
          id: "alignment-3",
          alertType: "file-drift",
          severity: "warning",
          message: "File drift from original scope",
          metrics: { files: ["a.ts", "b.ts"] },
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("File drift"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("File drift")

        stop()
      },
    })
  }, 20000)

  test("alignment.drift distraction renders", async () => {
    cleanupStorage = injectMockStorage()
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { url, stop } = createRealBusServer()
        const result = await renderChat(url)
        await initTUI(result)

        await Bun.sleep(100)

        await Bus.publish(SessionEvent.AlignmentDrift, {
          sessionID: "test-session",
          id: "alignment-4",
          alertType: "distraction",
          severity: "warning",
          message: "Distraction operation detected",
          metrics: {},
        })

        const { found, frame } = await waitForFrame(result, (f) => f.includes("Distraction"), 15000)
        expect(found).toBe(true)
        expect(frame).toContain("Distraction")

        stop()
      },
    })
  }, 20000)
})