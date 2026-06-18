import { describe, expect, test } from "bun:test"
import { BUILTIN_MODES } from "./mode-registry"

describe("BUILTIN_MODES", () => {
  test("has 6 modes with correct IDs", () => {
    expect(BUILTIN_MODES.length).toBe(6)
    const ids = BUILTIN_MODES.map((m) => m.id)
    expect(ids).toEqual(["ask", "build", "plan", "compose", "loop", "max"])
  })

  test("loop mode has correct configuration", () => {
    const loop = BUILTIN_MODES.find((m) => m.id === "loop")
    expect(loop).toBeDefined()
    expect(loop?.color).toBe("#007acc")
    expect(loop?.icon).toBe("🔄")
    expect(loop?.shortcut).toBe("mod+shift+l")
    expect(loop?.experimental).toBeUndefined()
  })

  test("max mode is experimental", () => {
    const max = BUILTIN_MODES.find((m) => m.id === "max")
    expect(max?.experimental).toBe(true)
  })

  test("all modes have required fields", () => {
    BUILTIN_MODES.forEach((mode) => {
      expect(mode.id).toBeTruthy()
      expect(mode.name).toBeTruthy()
      expect(mode.color).toMatch(/^#/)
      expect(mode.icon).toBeTruthy()
      expect(mode.placeholder).toBeTruthy()
      expect(mode.shortcut).toBeTruthy()
      expect(mode.description).toBeTruthy()
    })
  })

  test("shortcuts are unique", () => {
    const shortcuts = BUILTIN_MODES.map((m) => m.shortcut)
    const unique = new Set(shortcuts)
    expect(unique.size).toBe(shortcuts.length)
  })

  test("colors are unique", () => {
    const colors = BUILTIN_MODES.map((m) => m.color)
    const unique = new Set(colors)
    expect(unique.size).toBe(colors.length)
  })
})
