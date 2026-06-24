import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as path from "path"

const srcPath = path.join(__dirname, "..", "src")

describe("Chat textarea keybindings", () => {
  const chatSrc = fs.readFileSync(path.join(srcPath, "routes", "chat.tsx"), "utf-8")

  test("textarea has keyBindings prop with submit action for return", () => {
    expect(chatSrc).toContain('action: "submit"')
    expect(chatSrc).toContain('name: "return"')
  })

  test("textarea has onSubmit handler (not onKeyDown for Enter)", () => {
    expect(chatSrc).toContain("onSubmit=")
    // Should NOT have the old pattern of checking e.key === "return" in onKeyDown
    expect(chatSrc).not.toContain('e.key === "return"')
  })

  test("textarea onSubmit calls handleSend via double-defer (IME safe)", () => {
    // The onSubmit should use setTimeout pattern like the reference TUI
    expect(chatSrc).toMatch(/onSubmit=\{[\s\S]*?setTimeout[\s\S]*?handleSend/)
  })

  test("onKeyDown only handles escape, not enter", () => {
    // onKeyDown should exist for escape handling
    expect(chatSrc).toContain('e.name === "escape"')
    // But should not check for return/enter in onKeyDown
    expect(chatSrc).not.toContain('e.name === "return"')
    expect(chatSrc).not.toContain('e.name === "enter"')
  })
})

describe("App keyboard handling", () => {
  const appSrc = fs.readFileSync(path.join(srcPath, "app.tsx"), "utf-8")

  test("useKeyboard uses evt.name not evt.key", () => {
    expect(appSrc).toContain("evt.name")
    expect(appSrc).not.toContain("evt.key")
  })

  test("useKeyboard does not reference evt.alt (not in OpenTUI KeyEvent)", () => {
    expect(appSrc).not.toContain("evt.alt")
  })
})
