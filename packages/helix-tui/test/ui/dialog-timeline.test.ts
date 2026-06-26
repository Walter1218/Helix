import { describe, test, expect } from "bun:test"

describe("DialogTimeline", () => {
  test("exports DialogTimeline and showTimeline", async () => {
    const mod = await import("../../src/ui/dialog-timeline")
    expect(mod.DialogTimeline).toBeDefined()
    expect(typeof mod.DialogTimeline).toBe("function")
    expect(mod.showTimeline).toBeDefined()
    expect(typeof mod.showTimeline).toBe("function")
  })
})

describe("Export utilities", () => {
  test("exports exportSessionToMarkdown", async () => {
    const mod = await import("../../src/util/export")
    expect(mod.exportSessionToMarkdown).toBeDefined()
    expect(typeof mod.exportSessionToMarkdown).toBe("function")
  })

  test("exportSessionToMarkdown generates valid markdown", async () => {
    const mod = await import("../../src/util/export")
    const messages = [
      {
        id: "1",
        role: "user" as const,
        content: "Hello",
        timestamp: Date.now(),
      },
      {
        id: "2",
        role: "assistant" as const,
        content: "Hi there!",
        timestamp: Date.now(),
      },
    ]
    const result = mod.exportSessionToMarkdown(messages)
    expect(result).toContain("# Session Export")
    expect(result).toContain("Hello")
    expect(result).toContain("Hi there!")
    expect(result).toContain("User")
    expect(result).toContain("Assistant")
  })

  test("exportSessionToMarkdown respects options", async () => {
    const mod = await import("../../src/util/export")
    const messages = [
      {
        id: "1",
        role: "system" as const,
        content: "System message",
        timestamp: Date.now(),
      },
      {
        id: "2",
        role: "user" as const,
        content: "User message",
        timestamp: Date.now(),
      },
    ]

    const withSystem = mod.exportSessionToMarkdown(messages, { includeSystem: true })
    expect(withSystem).toContain("System message")

    const withoutSystem = mod.exportSessionToMarkdown(messages, { includeSystem: false })
    expect(withoutSystem).not.toContain("System message")
  })

  test("exportSessionToMarkdown includes tool calls when enabled", async () => {
    const mod = await import("../../src/util/export")
    const messages = [
      {
        id: "1",
        role: "assistant" as const,
        content: "Let me check",
        timestamp: Date.now(),
        toolCalls: [
          {
            id: "t1",
            name: "bash",
            input: '{"command":"ls"}',
            output: "file1.txt\nfile2.txt",
            status: "done" as const,
          },
        ],
      },
    ]

    const withTools = mod.exportSessionToMarkdown(messages, { includeToolCalls: true })
    expect(withTools).toContain("bash")
    expect(withTools).toContain("ls")

    const withoutTools = mod.exportSessionToMarkdown(messages, { includeToolCalls: false })
    expect(withoutTools).not.toContain("bash")
  })
})
