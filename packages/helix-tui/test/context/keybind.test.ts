import { describe, test, expect } from "bun:test"

describe("KeybindProvider", () => {
  test("exports useKeybind and KeybindProvider", async () => {
    const mod = await import("../../src/context/keybind")
    expect(mod.useKeybind).toBeDefined()
    expect(typeof mod.useKeybind).toBe("function")
    expect(mod.KeybindProvider).toBeDefined()
    expect(typeof mod.KeybindProvider).toBe("function")
  })

  test("Keybind interface has required fields", async () => {
    const mod = await import("../../src/context/keybind")
    const kb: mod.Keybind = {
      key: "return",
      action: "submit",
      description: "Submit message",
    }
    expect(kb.key).toBe("return")
    expect(kb.action).toBe("submit")
    expect(kb.ctrl).toBeUndefined()
    expect(kb.shift).toBeUndefined()
    expect(kb.meta).toBeUndefined()
  })

  test("Keybind with modifiers", async () => {
    const mod = await import("../../src/context/keybind")
    const kb: mod.Keybind = {
      key: "k",
      ctrl: true,
      action: "command-palette",
    }
    expect(kb.ctrl).toBe(true)
    expect(kb.shift).toBeUndefined()
  })
})
