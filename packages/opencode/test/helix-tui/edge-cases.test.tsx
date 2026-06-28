import { describe, expect, test } from "bun:test"
import { callPlugin, createHelixTestHarness } from "./helper"
import plugin from "@/cli/cmd/tui/feature-plugins/helix/index"

describe("Helix Plugin — Edge Cases", () => {
  test("malformed payload does not crash", async () => {
    const { api, eventSpy } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {} as any)
    eventSpy.emit("judge.verdict", null as any)
    eventSpy.emit("alignment.drift", undefined as any)
    eventSpy.emit("session.error", "not an object" as any)

    expect(eventSpy.handlerCount("cardinal.detected")).toBe(1)
    expect(eventSpy.handlerCount("judge.verdict")).toBe(1)
    expect(eventSpy.handlerCount("alignment.drift")).toBe(1)
    expect(eventSpy.handlerCount("session.error")).toBe(1)
  })

  test("cardinal with missing fields defaults gracefully", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", { sessionID: "sess" })
    expect(tracker.dialogReplaceCalls).toBe(0)
  })

  test("judge verdict with partial fields does not crash", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("judge.verdict", {
      sessionID: "sess",
      status: "fail",
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("session.error with non-object error field does not crash", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("session.error", {
      sessionID: "sess",
      error: "just a string",
    })

    expect(tracker.toastCalls.length).toBe(0)
  })

  test("session.error with missing error field has no toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("session.error", { sessionID: "sess" })
    expect(tracker.toastCalls.length).toBe(0)
  })

  test("mode.applied with missing mode keeps previous mode", async () => {
    const { api, eventSpy } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("mode.applied", { sessionID: "sess" })
    expect(eventSpy.handlerCount("mode.applied")).toBe(1)
  })

  test("multiple rapid events handled sequentially", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    for (let i = 0; i < 10; i++) {
      eventSpy.emit("cardinal.detected", {
        sessionID: `sess-${i}`,
        id: `c-${i}`,
        cardinalType: "test_failure",
        severity: "block",
        message: `Block ${i}`,
      })
    }

    expect(tracker.dialogReplaceCalls).toBe(10)
  })

  test("interleaved event types processed independently", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess", id: "c1", cardinalType: "tool_error",
      severity: "block", message: "Tool error",
    })

    eventSpy.emit("judge.verdict", {
      sessionID: "sess", id: "j1", status: "fail",
      checks: ["Check failed"], summary: "Violation",
    })

    eventSpy.emit("alignment.drift", {
      sessionID: "sess", alertType: "drift", severity: "warning",
      message: "Drift detected",
    })

    expect(tracker.dialogReplaceCalls).toBe(2)
    expect(tracker.toastCalls.length).toBeGreaterThanOrEqual(1)
  })
})
