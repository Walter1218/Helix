import { afterEach, describe, expect, test } from "bun:test"
import { Bus } from "../../src/bus"
import { Event as SessionEvent } from "../../src/session/session"
import { SessionID } from "../../src/session/schema"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

function withInstance(directory: string, fn: () => Promise<void>) {
  return Instance.provide({ directory, fn })
}

describe("Harness events: Cardinal, Judge, Alignment", () => {
  afterEach(() => Instance.disposeAll())

  test("cardinal.detected is published and received via subscribeAll", async () => {
    await using tmp = await tmpdir()
    const received: any[] = []

    await withInstance(tmp.path, async () => {
      Bus.subscribeAll((evt) => {
        if (evt.type === "cardinal.detected") received.push(evt.properties)
      })
      await Bun.sleep(10)

      await Bus.publish(SessionEvent.CardinalDetected, {
        sessionID: SessionID.make("test-session-1"),
        id: "cardinal-1",
        cardinalType: "security",
        severity: "block",
        message: "Potential security risk detected",
        autoDegrade: false,
      })
      await Bun.sleep(10)
    })

    expect(received.length).toBe(1)
    expect(received[0]).toMatchObject({
      sessionID: "test-session-1",
      id: "cardinal-1",
      cardinalType: "security",
      severity: "block",
      message: "Potential security risk detected",
    })
  })

  test("judge.verdict is published and received via subscribeAll", async () => {
    await using tmp = await tmpdir()
    const received: any[] = []

    await withInstance(tmp.path, async () => {
      Bus.subscribeAll((evt) => {
        if (evt.type === "judge.verdict") received.push(evt.properties)
      })
      await Bun.sleep(10)

      await Bus.publish(SessionEvent.JudgeVerdict, {
        sessionID: SessionID.make("test-session-2"),
        id: "judge-1",
        status: "fail",
        checks: ["Missing test coverage", "Unsafe code pattern"],
        summary: "Code quality issues detected",
      })
      await Bun.sleep(10)
    })

    expect(received.length).toBe(1)
    expect(received[0]).toMatchObject({
      sessionID: "test-session-2",
      id: "judge-1",
      status: "fail",
      checks: ["Missing test coverage", "Unsafe code pattern"],
      summary: "Code quality issues detected",
    })
  })

  test("alignment.drift is published and received via subscribeAll", async () => {
    await using tmp = await tmpdir()
    const received: any[] = []

    await withInstance(tmp.path, async () => {
      Bus.subscribeAll((evt) => {
        if (evt.type === "alignment.drift") received.push(evt.properties)
      })
      await Bun.sleep(10)

      await Bus.publish(SessionEvent.AlignmentDrift, {
        sessionID: SessionID.make("test-session-3"),
        id: "alignment-1",
        alertType: "file-drift",
        severity: "warning",
        message: "Agent modified files outside scope",
        metrics: { files: ["a.ts", "b.ts"], timestamp: Date.now() },
      })
      await Bun.sleep(10)
    })

    expect(received.length).toBe(1)
    expect(received[0]).toMatchObject({
      sessionID: "test-session-3",
      id: "alignment-1",
      alertType: "file-drift",
      severity: "warning",
      message: "Agent modified files outside scope",
    })
    expect(received[0].metrics).toBeDefined()
  })
})
