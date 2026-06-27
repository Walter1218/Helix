import { describe, expect, test } from "bun:test"
import {
  toFrontendFormat,
  type PreFlightResult,
  type EnrichedCheckResult,
} from "../../src/session/preflight"

function makeResult(overrides: Partial<PreFlightResult> = {}): PreFlightResult {
  return {
    passed: true,
    blocked: false,
    paused: false,
    results: [],
    ...overrides,
  }
}

function makeCheck(partial: Partial<EnrichedCheckResult> = {}): EnrichedCheckResult {
  return {
    id: "test_check",
    name: "Test Check",
    passed: true,
    level: "info",
    message: "ok",
    ...partial,
  }
}

describe("preflight.toFrontendFormat", () => {
  test("all passed → trustLevel high, decision proceed", () => {
    const result = makeResult({
      results: [
        makeCheck({ id: "a", name: "A", passed: true, level: "info" }),
        makeCheck({ id: "b", name: "B", passed: true, level: "info" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("high")
    expect(out.decision).toBe("proceed")
    expect(out.items).toHaveLength(2)
    expect(out.items[0].status).toBe("completed")
    expect(out.items[1].status).toBe("completed")
  })

  test("warn level → trustLevel medium", () => {
    const result = makeResult({
      results: [
        makeCheck({ id: "a", name: "A", passed: true, level: "info" }),
        makeCheck({ id: "b", name: "B", passed: true, level: "warn", message: "heads up" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("medium")
    expect(out.items[1].status).toBe("warning")
    expect(out.items[1].details).toBe("heads up")
  })

  test("block failure → trustLevel low, decision block", () => {
    const result = makeResult({
      passed: false,
      blocked: true,
      blockReason: "spec missing",
      results: [
        makeCheck({ id: "a", name: "A", passed: false, level: "block", message: "spec missing" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("low")
    expect(out.decision).toBe("block")
    expect(out.items[0].status).toBe("failed")
  })

  test("pause failure → decision pause, trustLevel medium", () => {
    const result = makeResult({
      passed: false,
      paused: true,
      pauseReason: "deps not met",
      results: [
        makeCheck({ id: "dep", name: "Deps", passed: false, level: "pause", message: "deps not met" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("medium")
    expect(out.decision).toBe("pause")
    expect(out.items[0].status).toBe("warning")
  })

  test("empty results → trustLevel high, decision proceed", () => {
    const out = toFrontendFormat(makeResult())

    expect(out.trustLevel).toBe("high")
    expect(out.decision).toBe("proceed")
    expect(out.items).toHaveLength(0)
    expect(out.autoLearnEnabled).toBe(false)
  })

  test("mixed passed + warn → trustLevel medium", () => {
    const result = makeResult({
      results: [
        makeCheck({ id: "a", name: "A", passed: true, level: "info" }),
        makeCheck({ id: "b", name: "B", passed: true, level: "warn" }),
        makeCheck({ id: "c", name: "C", passed: true, level: "info" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("medium")
  })
})

describe("preflight.checkLevelToStatus mapping", () => {
  test("passed + info → completed", () => {
    const out = toFrontendFormat(makeResult({ results: [makeCheck({ passed: true, level: "info" })] }))
    expect(out.items[0].status).toBe("completed")
  })

  test("passed + warn → warning", () => {
    const out = toFrontendFormat(makeResult({ results: [makeCheck({ passed: true, level: "warn" })] }))
    expect(out.items[0].status).toBe("warning")
  })

  test("failed + block → failed", () => {
    const out = toFrontendFormat(makeResult({ results: [makeCheck({ passed: false, level: "block" })] }))
    expect(out.items[0].status).toBe("failed")
  })

  test("failed + pause → warning", () => {
    const out = toFrontendFormat(makeResult({ results: [makeCheck({ passed: false, level: "pause" })] }))
    expect(out.items[0].status).toBe("warning")
  })

  test("failed + warn → warning", () => {
    const out = toFrontendFormat(makeResult({ results: [makeCheck({ passed: false, level: "warn" })] }))
    expect(out.items[0].status).toBe("warning")
  })
})

describe("preflight.toFrontendFormat edge cases", () => {
  test("multiple blocks → all failed", () => {
    const result = makeResult({
      passed: false,
      blocked: true,
      blockReason: "multiple",
      results: [
        makeCheck({ id: "a", name: "A", passed: false, level: "block" }),
        makeCheck({ id: "b", name: "B", passed: false, level: "block" }),
      ],
    })
    const out = toFrontendFormat(result)

    expect(out.trustLevel).toBe("low")
    expect(out.items.filter((i) => i.status === "failed")).toHaveLength(2)
  })

  test("preserves item id and label from enriched result", () => {
    const result = makeResult({
      results: [makeCheck({ id: "spec_completeness", name: "Spec完整性" })],
    })
    const out = toFrontendFormat(result)

    expect(out.items[0].id).toBe("spec_completeness")
    expect(out.items[0].label).toBe("Spec完整性")
  })
})
