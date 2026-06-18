import { describe, expect, test } from "bun:test"
import { levelConfig, type AttentionLevel } from "./zen-mode-toggle"

describe("ZenModeToggle levelConfig", () => {
  test("maps all attention levels", () => {
    const levels: AttentionLevel[] = [1, 2, 3, 4]
    levels.forEach((level) => {
      expect(levelConfig[level]).toBeDefined()
      expect(levelConfig[level].label).toBeTruthy()
      expect(levelConfig[level].color).toMatch(/^#/)
      expect(levelConfig[level].description).toBeTruthy()
    })
  })

  test("has correct labels", () => {
    expect(levelConfig[1].label).toBe("Alert")
    expect(levelConfig[2].label).toBe("Normal")
    expect(levelConfig[3].label).toBe("Focused")
    expect(levelConfig[4].label).toBe("Zen Mode")
  })

  test("has correct colors", () => {
    expect(levelConfig[1].color).toBe("#ef4444")
    expect(levelConfig[2].color).toBe("#eab308")
    expect(levelConfig[3].color).toBe("#22c55e")
    expect(levelConfig[4].color).toBe("#3b82f6")
  })

  test("colors are distinct", () => {
    const colors = [1, 2, 3, 4].map((l) => levelConfig[l as AttentionLevel].color)
    const unique = new Set(colors)
    expect(unique.size).toBe(colors.length)
  })
})
