import { describe, test, expect } from "bun:test"

describe("SyncProvider utilities", () => {
  test("bucketMessages groups by agentID", async () => {
    const mod = await import("../../src/context/sync")
    const msgs = [
      { id: "1", agentID: "main" },
      { id: "2", agentID: "sub1" },
      { id: "3", agentID: "main" },
      { id: "4", agentID: null },
    ]
    const result = mod.bucketMessages(msgs)
    expect(Object.keys(result)).toContain("main")
    expect(Object.keys(result)).toContain("sub1")
    expect(result["main"].length).toBe(3)
    expect(result["sub1"].length).toBe(1)
  })

  test("bucketMessages uses 'main' for null agentID", async () => {
    const mod = await import("../../src/context/sync")
    const msgs = [{ id: "1", agentID: null }]
    const result = mod.bucketMessages(msgs)
    expect(result["main"]).toBeDefined()
    expect(result["main"][0].id).toBe("1")
  })

  test("bucketMessages handles empty array", async () => {
    const mod = await import("../../src/context/sync")
    const result = mod.bucketMessages([])
    expect(Object.keys(result).length).toBe(0)
  })

  test("bucketMessages handles undefined agentID", async () => {
    const mod = await import("../../src/context/sync")
    const msgs = [{ id: "1", agentID: undefined }]
    const result = mod.bucketMessages(msgs)
    expect(result["main"]).toBeDefined()
    expect(result["main"].length).toBe(1)
  })

  test("actorStatusFromEvent maps correctly", async () => {
    const mod = await import("../../src/context/sync")
    const fn = (mod as any).actorStatusFromEvent
    if (!fn) return
    expect(fn("pending", undefined)).toBe("pending")
    expect(fn("running", undefined)).toBe("running")
    expect(fn("idle", "success")).toBe("completed")
    expect(fn("idle", "failure")).toBe("failed")
    expect(fn("idle", "cancelled")).toBe("cancelled")
    expect(fn("idle", undefined)).toBe("unknown")
  })
})
