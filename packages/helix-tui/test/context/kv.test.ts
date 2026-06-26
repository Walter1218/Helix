import { describe, test, expect } from "bun:test"

describe("KVProvider module", () => {
  test("exports useKV and KVProvider", async () => {
    const mod = await import("../../src/context/kv")
    expect(mod.useKV).toBeDefined()
    expect(typeof mod.useKV).toBe("function")
    expect(mod.KVProvider).toBeDefined()
    expect(typeof mod.KVProvider).toBe("function")
  })
})
