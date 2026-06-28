import { describe, expect, test } from "bun:test"
import { callPlugin, createHelixTestHarness } from "./helper"
import plugin from "@/cli/cmd/tui/feature-plugins/helix/index"

describe("Phase 2a — Pre-flight Result Handling", () => {
  test("2a-1: Pre-flight blocked with empty results still triggers dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf1",
      passed: false,
      blocked: true,
      paused: false,
      results: [],
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2a-2: Pre-flight blocked with single result shows dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf2",
      passed: false,
      blocked: true,
      paused: false,
      results: [
        { id: "r1", name: "Check git status", passed: false, level: "error", message: "Uncommitted changes" },
      ],
    })

    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2a-3: Pre-flight paused does NOT trigger dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf3",
      passed: false,
      blocked: false,
      paused: true,
      results: [
        { id: "r2", name: "Check dependencies", passed: true, level: "info", message: "All deps installed" },
      ],
    })

    expect(tracker.dialogReplaceCalls).toBe(0)
  })

  test("2a-4: Pre-flight with multiple results passes through correctly", async () => {
    const { api, eventSpy } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf4",
      passed: true,
      blocked: false,
      paused: false,
      results: [
        { id: "r3", name: "Check git status", passed: true, level: "info", message: "Clean" },
        { id: "r4", name: "Check deps", passed: true, level: "info", message: "OK" },
        { id: "r5", name: "Check config", passed: true, level: "info", message: "Valid" },
      ],
    })

    expect(eventSpy.handlerCount("preflight.result")).toBe(1)
  })

  test("2a-5: Multiple pre-flight results — only blocked triggers dialog", async () => {
    const { api, eventSpy, tracker } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf5",
      passed: true,
      blocked: false,
      paused: false,
      results: [{ id: "r6", name: "Check", passed: true, level: "info", message: "OK" }],
    })
    expect(tracker.dialogReplaceCalls).toBe(0)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf5",
      passed: false,
      blocked: true,
      paused: false,
      results: [{ id: "r7", name: "Check", passed: false, level: "error", message: "Fail" }],
    })
    expect(tracker.dialogReplaceCalls).toBe(1)
  })

  test("2a-6: Pre-flight with missing fields is handled gracefully", async () => {
    const { api, eventSpy } = createHelixTestHarness()
        await callPlugin(plugin, api)

    eventSpy.emit("preflight.result", {
      sessionID: "sess-pf6",
      passed: true,
      blocked: false,
      paused: false,
    })

    expect(eventSpy.handlerCount("preflight.result")).toBe(1)
  })
})
