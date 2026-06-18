import { describe, expect, test } from "bun:test"
import { statusIcon, statusColor, type TaskStatus } from "./task-list-panel"

describe("TaskListPanel utilities", () => {
  test("statusIcon maps all statuses correctly", () => {
    const expected: Record<TaskStatus, string> = {
      pending: "⏳",
      in_progress: "🔄",
      completed: "✅",
      failed: "❌",
      paused: "⏸",
    }
    const statuses: TaskStatus[] = ["pending", "in_progress", "completed", "failed", "paused"]
    statuses.forEach((s) => {
      expect(statusIcon[s]).toBe(expected[s])
    })
  })

  test("statusColor maps all statuses to tailwind classes", () => {
    const expected: Record<TaskStatus, string> = {
      pending: "text-text-weak",
      in_progress: "text-amber-500",
      completed: "text-green-500",
      failed: "text-red-500",
      paused: "text-orange-400",
    }
    const statuses: TaskStatus[] = ["pending", "in_progress", "completed", "failed", "paused"]
    statuses.forEach((s) => {
      expect(statusColor[s]).toBe(expected[s])
    })
  })

  test("all TaskStatus values have icon and color mappings", () => {
    const statuses: TaskStatus[] = ["pending", "in_progress", "completed", "failed", "paused"]
    statuses.forEach((s) => {
      expect(statusIcon[s]).toBeTruthy()
      expect(statusColor[s]).toBeTruthy()
    })
  })
})
