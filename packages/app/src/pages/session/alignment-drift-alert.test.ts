import { describe, expect, test } from "bun:test"
import { driftConfig, type DriftType } from "./alignment-drift-alert"

describe("AlignmentDriftAlert driftConfig", () => {
  test("maps all drift types", () => {
    const types: DriftType[] = ["file_drift", "rabbit_hole", "distraction"]
    types.forEach((type) => {
      expect(driftConfig[type]).toBeDefined()
      expect(driftConfig[type].icon).toBeTruthy()
      expect(driftConfig[type].label).toBeTruthy()
    })
  })

  test("has correct Chinese labels", () => {
    expect(driftConfig.file_drift.label).toBe("文件漂移")
    expect(driftConfig.rabbit_hole.label).toBe("兔子洞")
    expect(driftConfig.distraction.label).toBe("分心操作")
  })

  test("has correct icons", () => {
    expect(driftConfig.file_drift.icon).toBe("📁")
    expect(driftConfig.rabbit_hole.icon).toBe("🐰")
    expect(driftConfig.distraction.icon).toBe("🎯")
  })
})
