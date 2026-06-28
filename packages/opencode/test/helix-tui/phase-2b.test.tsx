import { describe, expect, test } from "bun:test"
import { callPlugin, createHelixTestHarness } from "./helper"
import plugin from "@/cli/cmd/tui/feature-plugins/helix/index"

describe("Phase 2b — Cardinal + Judge + AlignmentGuard", () => {
  test("2b-1: Cardinal block triggers dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-1",
      id: "c-1",
      cardinalType: "test_failure",
      severity: "block",
      message: "Build failed due to test failure",
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2b-2: Cardinal stop triggers dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-2",
      id: "c-2",
      cardinalType: "external_dep",
      severity: "stop",
      message: "External dependency violation",
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2b-3: Cardinal warn does NOT trigger dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-3",
      id: "c-3",
      cardinalType: "token_budget",
      severity: "warn",
      message: "Token budget exceeded",
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
  })

  test("2b-4: Cardinal pause does NOT trigger dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-4",
      id: "c-4",
      cardinalType: "ambiguity",
      severity: "pause",
      message: "Goal ambiguity detected — please clarify",
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
  })

  test("2b-5: Judge failure triggers dialog + toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("judge.verdict", {
      sessionID: "sess-5",
      id: "j-1",
      status: "fail",
      checks: ["Check1: invalid output format", "Check2: missing required field"],
      summary: "Output violates HELIX-7: structured output format",
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
    expect(tracker.toastCalls.length).toBeGreaterThanOrEqual(1)
    const toast = tracker.toastCalls[0]
    expect(toast.variant).toBe("warning")
    expect(toast.title).toContain("VIOLATION")
  })

  test("2b-6: Judge pass does NOT trigger dialog or toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("judge.verdict", {
      sessionID: "sess-6",
      id: "j-2",
      status: "pass",
      checks: [],
      summary: "All checks passed",
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
    expect(tracker.toastCalls.length).toBe(0)
  })

  test("2b-7: Alignment drift increments silently (no dialog)", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("alignment.drift", {
      sessionID: "sess-7",
      alertType: "drift",
      severity: "warning",
      message: "Session goal drift detected — focus on original task",
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
    expect(tracker.toastCalls.length).toBe(0)
  })

  test("2b-8: Pre-flight blocked triggers dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-8",
      passed: false,
      blocked: true,
      paused: false,
      results: [
        { id: "pf-1", name: "Git status check", passed: false, level: "error", message: "Uncommitted changes" },
      ],
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2b-9: Pre-flight passed does NOT trigger dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-9",
      passed: true,
      blocked: false,
      paused: false,
      results: [
        { id: "pf-2", name: "Git status check", passed: true, level: "info", message: "Clean working tree" },
      ],
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
  })

  test("2b-10: Mode applied updates mode label", async () => {
    const { api, eventSpy } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("mode.applied", {
      mode: "build",
      sessionID: "sess-10",
      judgeEnabled: true,
      specDriven: false,
    })

    eventSpy.emit("mode.applied", {
      mode: "plan",
      sessionID: "sess-10",
      judgeEnabled: true,
      specDriven: true,
    })

    expect(eventSpy.handlerCount("mode.applied")).toBeGreaterThan(0)
  })

  test("2b-11: Session error with Cardinal block triggers toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("session.error", {
      sessionID: "sess-11",
      error: { message: "Cardinal block: test_failure detected" },
    })

    expect(tracker.toastCalls.length).toBeGreaterThanOrEqual(1)
    const toast = tracker.toastCalls[0]
    expect(toast.variant).toBe("error")
    expect(toast.title).toContain("Blocked")
  })

  test("2b-12: Session error with Judge block triggers toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("session.error", {
      sessionID: "sess-12",
      error: { message: "Judge blocked: output format violation" },
    })

    expect(tracker.toastCalls.length).toBeGreaterThanOrEqual(1)
    const toast = tracker.toastCalls[0]
    expect(toast.title).toContain("Blocked")
  })

  test("2b-13: Session error with Pre-flight blocked triggers toast", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("session.error", {
      sessionID: "sess-13",
      error: { message: "Pre-flight blocked: git status check failed" },
    })

    expect(tracker.toastCalls.length).toBeGreaterThanOrEqual(1)
    const toast = tracker.toastCalls[0]
    expect(toast.title).toContain("Blocked")
  })

  test("2b-14: Multiple cardinal events only show one dialog at a time", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
    await callPlugin(plugin, api)

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-14",
      id: "c-5",
      cardinalType: "test_failure",
      severity: "block",
      message: "First block",
    })

    eventSpy.emit("cardinal.detected", {
      sessionID: "sess-14",
      id: "c-6",
      cardinalType: "tool_error",
      severity: "block",
      message: "Second block",
    })

    expect(tracker.dialogReplaceCalls).toBe(2)
  })

  test("2b-15: Event registration registers 6 handlers", async () => {
    const { api, eventSpy } = createHelixTestHarness()
    await callPlugin(plugin, api)

    expect(eventSpy.handlerCount("judge.verdict")).toBe(1)
    expect(eventSpy.handlerCount("cardinal.detected")).toBe(1)
    expect(eventSpy.handlerCount("alignment.drift")).toBe(1)
    expect(eventSpy.handlerCount("preflight.result")).toBe(1)
    expect(eventSpy.handlerCount("mode.applied")).toBe(1)
    expect(eventSpy.handlerCount("session.error")).toBe(1)
    expect(eventSpy.calls.length).toBe(0)
  })
})
