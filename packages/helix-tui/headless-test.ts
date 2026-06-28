#!/usr/bin/env bun --conditions=browser
/**
 * Helix TUI 状态检测脚本
 *
 * 通过 headless controller 检测 TUI 当前状态和 chat 模式 UI。
 */

import { createHeadlessTUI, formatFrame, findInFrame, type HeadlessTUI } from "./test/utils/headless-controller.tsx"

let tui: HeadlessTUI | null = null

try {
  console.log("=== Helix TUI Headless Test ===\n")

  // 1. 创建 headless TUI（Home 视图）
  console.log("[1] Creating headless TUI (Home view)...")
  tui = await createHeadlessTUI({
    width: 120,
    height: 35,
    scenario: { type: "direct", response: "OK" },
  })

  await tui.render()
  const homeFrame = tui.captureFrame()
  console.log("\n--- Home View (120x35) ---")
  console.log(formatFrame(homeFrame, 35))
  console.log("\n--- Home View Analysis ---")

  // Check for key UI elements
  const homeChecks = [
    { name: "Logo/Title", patterns: ["Helix", "HELIX", "MiMo", "╲"] },
    { name: "Prompt area", patterns: ["Ask", "Build", "Type", "input", ">"] },
    { name: "Agent mode", patterns: ["Ask", "Build", "agent"] },
    { name: "Model info", patterns: ["model", "MiMo", "claude", "gpt"] },
    { name: "Keyboard hints", patterns: ["Tab", "Enter", "Ctrl", "Esc"] },
  ]

  for (const check of homeChecks) {
    const found = check.patterns.some((p) => homeFrame.includes(p))
    console.log(`  ${found ? "✓" : "✗"} ${check.name}: ${found ? "found" : "not found"}`)
  }

  // 2. 测试输入
  console.log("\n[2] Testing text input...")
  await tui.typeText("Hello, this is a test message")
  await tui.render()
  const inputFrame = tui.captureFrame()
  const hasInput = inputFrame.includes("Hello") || inputFrame.includes("test message")
  console.log(`  ${hasInput ? "✓" : "✗"} Text input visible: ${hasInput}`)

  // 3. 检测 UI 组件
  console.log("\n[3] Detecting UI components...")
  const uiElements = [
    { name: "Session sidebar", patterns: ["session", "Session", "sidebar"] },
    { name: "Status bar", patterns: ["status", "Status", "tokens", "context"] },
    { name: "Footer", patterns: ["project", "evolution", "monitor"] },
    { name: "Header", patterns: ["BUILD", "J:✓", "guard"] },
    { name: "Context info", patterns: ["Context", "token", "LSP"] },
    { name: "Keybinds visible", patterns: ["Ctrl+K", "Ctrl+L", "Ctrl+J"] },
  ]

  for (const elem of uiElements) {
    const found = elem.patterns.some((p) => inputFrame.includes(p))
    console.log(`  ${found ? "✓" : "✗"} ${elem.name}: ${found ? "visible" : "not visible"}`)
  }

  // 4. 帧内容统计
  console.log("\n[4] Frame statistics...")
  const lines = inputFrame.split("\n")
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0)
  console.log(`  Total lines: ${lines.length}`)
  console.log(`  Non-empty lines: ${nonEmptyLines.length}`)
  console.log(`  Frame size: ${inputFrame.length} chars`)

  // 5. 搜索特定模式
  console.log("\n[5] Pattern search...")
  const searchPatterns = ["Helix", "session", "model", "agent", "Ask", "Build", "Ctrl", "Tab", "Enter"]
  for (const pattern of searchPatterns) {
    const matches = findInFrame(inputFrame, pattern)
    if (matches.length > 0) {
      console.log(`  "${pattern}" found ${matches.length}x at: ${matches.map((m) => `L${m.line}:C${m.col}`).join(", ")}`)
    }
  }

  // 6. 测试键盘快捷键
  console.log("\n[6] Testing keyboard shortcuts...")

  // Test Escape
  await tui.pressEscape()
  await tui.render()
  const escFrame = tui.captureFrame()
  console.log(`  After Escape: frame changed = ${escFrame !== inputFrame}`)

  // Test Tab (cycle agent)
  await tui.pressTab()
  await tui.render()
  const tabFrame = tui.captureFrame()
  console.log(`  After Tab: frame changed = ${tabFrame !== escFrame}`)

  console.log("\n=== Test Complete ===")
} catch (error) {
  console.error("Test failed:", error)
  if (error instanceof Error) {
    console.error("Stack:", error.stack)
  }
} finally {
  if (tui) {
    await tui.destroy()
  }
}
