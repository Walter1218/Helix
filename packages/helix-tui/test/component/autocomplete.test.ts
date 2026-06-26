import { describe, test, expect } from "bun:test"

describe("Autocomplete", () => {
  test("exports Autocomplete component", async () => {
    const mod = await import("../../src/component/autocomplete")
    expect(mod.Autocomplete).toBeDefined()
    expect(typeof mod.Autocomplete).toBe("function")
  })
})

describe("PromptStash", () => {
  test("exports usePromptStash hook", async () => {
    const mod = await import("../../src/component/prompt-stash")
    expect(mod.usePromptStash).toBeDefined()
    expect(typeof mod.usePromptStash).toBe("function")
  })

  test("exports PromptStashIndicator component", async () => {
    const mod = await import("../../src/component/prompt-stash")
    expect(mod.PromptStashIndicator).toBeDefined()
    expect(typeof mod.PromptStashIndicator).toBe("function")
  })
})
