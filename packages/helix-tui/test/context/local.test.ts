import { describe, test, expect } from "bun:test"

describe("LocalProvider utilities", () => {
  test("parseModel splits provider and model", async () => {
    const mod = await import("../../src/context/local")
    const result = mod.parseModel("anthropic/claude-3-opus")
    expect(result.providerID).toBe("anthropic")
    expect(result.modelID).toBe("claude-3-opus")
  })

  test("parseModel handles model with slashes", async () => {
    const mod = await import("../../src/context/local")
    const result = mod.parseModel("openai/gpt-4/turbo")
    expect(result.providerID).toBe("openai")
    expect(result.modelID).toBe("gpt-4/turbo")
  })

  test("parseModel handles single segment", async () => {
    const mod = await import("../../src/context/local")
    const result = mod.parseModel("claude")
    expect(result.providerID).toBe("claude")
    expect(result.modelID).toBe("")
  })

  test("exports useLocal and LocalProvider", async () => {
    const mod = await import("../../src/context/local")
    expect(mod.useLocal).toBeDefined()
    expect(typeof mod.useLocal).toBe("function")
    expect(mod.LocalProvider).toBeDefined()
    expect(typeof mod.LocalProvider).toBe("function")
  })
})
