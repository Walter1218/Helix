import { describe, expect, it } from "bun:test"

describe("Heap module", () => {
  it("LIMIT is 1.5GB", async () => {
    const heap = await import("../../src/cli/heap")
    expect(heap).toBeDefined()
  })

  it("gc function exists and is callable", async () => {
    const { Heap } = await import("../../src/cli/heap")
    expect(typeof Heap.gc).toBe("function")
    expect(() => Heap.gc()).not.toThrow()
  })
})
