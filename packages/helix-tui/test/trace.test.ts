import { describe, expect, test, beforeEach } from "bun:test"
import * as trace from "../src/trace"

describe("Trace module", () => {
  beforeEach(() => {
    trace.clear()
    trace.setEnabled(true)
  })

  test("emit stores trace event", () => {
    trace.emit("user.send", "info", "User sent message", { length: 5 })
    const traces = trace.getTraces()
    expect(traces).toHaveLength(1)
    expect(traces[0].type).toBe("user.send")
    expect(traces[0].level).toBe("info")
    expect(traces[0].message).toBe("User sent message")
    expect(traces[0].data?.length).toBe(5)
    expect(traces[0].timestamp).toBeGreaterThan(0)
  })

  test("emit with sessionId", () => {
    trace.emit("session.create", "info", "Creating session", {}, "sess-1")
    const traces = trace.getTraces()
    expect(traces[0].sessionId).toBe("sess-1")
  })

  test("getTraces filters by type", () => {
    trace.emit("user.send", "info", "send")
    trace.emit("session.create", "info", "create")
    trace.emit("user.send", "info", "send2")

    expect(trace.getTraces({ type: "user.send" })).toHaveLength(2)
    expect(trace.getTraces({ type: "session.create" })).toHaveLength(1)
  })

  test("getTraces filters by sessionId", () => {
    trace.emit("user.send", "info", "a", {}, "sess-1")
    trace.emit("user.send", "info", "b", {}, "sess-2")
    trace.emit("user.send", "info", "c", {}, "sess-1")

    expect(trace.getTraces({ sessionId: "sess-1" })).toHaveLength(2)
    expect(trace.getTraces({ sessionId: "sess-2" })).toHaveLength(1)
  })

  test("getTraces filters by level", () => {
    trace.emit("user.send", "info", "a")
    trace.emit("session.error", "error", "b")
    trace.emit("event.delta", "debug", "c")

    expect(trace.getTraces({ level: "info" })).toHaveLength(1)
    expect(trace.getTraces({ level: "error" })).toHaveLength(1)
    expect(trace.getTraces({ level: "debug" })).toHaveLength(1)
  })

  test("clear removes all traces", () => {
    trace.emit("user.send", "info", "a")
    trace.emit("user.send", "info", "b")
    expect(trace.getTraces()).toHaveLength(2)

    trace.clear()
    expect(trace.getTraces()).toHaveLength(0)
  })

  test("disabled mode does not emit", () => {
    trace.setEnabled(false)
    trace.emit("user.send", "info", "should not exist")
    expect(trace.getTraces()).toHaveLength(0)
  })

  test("re-enable after disable works", () => {
    trace.setEnabled(false)
    trace.emit("user.send", "info", "no")
    expect(trace.getTraces()).toHaveLength(0)

    trace.setEnabled(true)
    trace.emit("user.send", "info", "yes")
    expect(trace.getTraces()).toHaveLength(1)
  })

  test("max traces limit", () => {
    // Emit more than MAX_TRACES
    for (let i = 0; i < 10100; i++) {
      trace.emit("event.delta", "debug", `event ${i}`)
    }
    const traces = trace.getTraces()
    expect(traces.length).toBeLessThanOrEqual(10000)
    // Should keep the latest ones
    expect(traces[traces.length - 1].message).toBe("event 10099")
  })

  test("getTraceLog returns a path", () => {
    const logPath = trace.getTraceLog()
    expect(logPath).toContain("helix-tui")
    expect(logPath).toContain("trace-")
    expect(logPath).toContain(".log")
  })

  test("all TraceEventTypes are valid", () => {
    const types = [
      "user.send", "user.navigate", "user.permission_reply", "user.question_reply", "user.abort",
      "session.create", "session.created", "session.prompt", "session.prompt_response",
      "session.error", "session.idle", "event.delta", "event.permission_asked", "event.question_asked",
      "ui.render", "ui.focus", "ui.error",
    ]

    for (const type of types) {
      trace.emit(type as any, "info", `test ${type}`)
    }

    expect(trace.getTraces()).toHaveLength(types.length)
  })

  test("event data is preserved", () => {
    trace.emit("session.error", "error", "test error", {
      error: "connection failed",
      code: 500,
      details: { retry: true },
    })

    const event = trace.getTraces()[0]
    expect(event.data?.error).toBe("connection failed")
    expect(event.data?.code).toBe(500)
    expect(event.data?.details).toEqual({ retry: true })
  })
})
