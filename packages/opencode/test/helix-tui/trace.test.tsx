import { describe, expect, test } from "bun:test"
import * as trace from "@/cli/cmd/tui/feature-plugins/helix/trace"

describe("Helix Trace Module", () => {
  test("emit stores trace events", () => {
    trace.clear()
    trace.setFileLogging(false)

    trace.emit("ui.init", "info", "Test initialization")
    const events = trace.getTraces()
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("ui.init")
    expect(events[0].level).toBe("info")
    expect(events[0].message).toBe("Test initialization")
  })

  test("emit stores event with session ID and data", () => {
    trace.clear()

    trace.emit("judge.verdict", "warn", "Judge violation", {
      sessionID: "sess-1",
      status: "fail",
      checksCount: 2,
    }, "sess-1")

    const events = trace.getTraces({ sessionId: "sess-1" })
    expect(events.length).toBe(1)
    expect(events[0].data?.sessionID).toBe("sess-1")
    expect(events[0].data?.status).toBe("fail")
    expect(events[0].sessionId).toBe("sess-1")
  })

  test("filter by type", () => {
    trace.clear()

    trace.emit("ui.init", "info", "Init")
    trace.emit("judge.verdict", "warn", "Verdict")
    trace.emit("cardinal.detected", "error", "Cardinal")

    const judgeEvents = trace.getTraces({ type: "judge.verdict" })
    expect(judgeEvents.length).toBe(1)
    expect(judgeEvents[0].type).toBe("judge.verdict")
  })

  test("filter by level", () => {
    trace.clear()

    trace.emit("ui.init", "info", "Info message")
    trace.emit("ui.init", "error", "Error message")

    const errorEvents = trace.getTraces({ level: "error" })
    expect(errorEvents.length).toBe(1)
    expect(errorEvents[0].message).toBe("Error message")
  })

  test("max traces cap at 10000", () => {
    trace.clear()

    for (let i = 0; i < 10050; i++) {
      trace.emit("ui.init", "info", `Trace ${i}`)
    }

    const events = trace.getTraces()
    expect(events.length).toBe(10000)
    expect(events[0].message).toBe("Trace 50")
  })

  test("disabled trace does not store events", () => {
    trace.clear()
    trace.setEnabled(false)

    trace.emit("ui.init", "info", "Should not appear")
    expect(trace.getTraces().length).toBe(0)

    trace.setEnabled(true)
  })

  test("clear removes all events", () => {
    trace.clear()
    trace.emit("ui.init", "info", "A")
    trace.emit("ui.init", "info", "B")
    expect(trace.getTraces().length).toBe(2)

    trace.clear()
    expect(trace.getTraces().length).toBe(0)
  })

  test("file logging toggles correctly", () => {
    trace.clear()
    trace.setFileLogging(false)

    trace.emit("ui.init", "info", "No file log")
    expect(trace.getTraces().length).toBe(1)

    trace.setFileLogging(true)
  })

  test("traces include timestamp and id", () => {
    trace.clear()

    const before = Date.now()
    trace.emit("mode.switch", "info", "Mode change")
    const after = Date.now()

    const events = trace.getTraces()
    expect(events[0].id).toBeDefined()
    expect(events[0].id.length).toBeGreaterThanOrEqual(6)
    expect(events[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(events[0].timestamp).toBeLessThanOrEqual(after)
  })

  test("getTraceLog returns non-empty path", () => {
    const logPath = trace.getTraceLog()
    expect(logPath).toBeDefined()
    expect(logPath.length).toBeGreaterThan(0)
    expect(logPath).toContain("helix-tui")
  })
})
