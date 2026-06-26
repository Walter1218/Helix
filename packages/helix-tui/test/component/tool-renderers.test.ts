import { describe, test, expect } from "bun:test"

describe("ToolRenderers", () => {
  test("exports ToolRenderer component", async () => {
    const mod = await import("../../src/component/tool-renderers")
    expect(mod.ToolRenderer).toBeDefined()
    expect(typeof mod.ToolRenderer).toBe("function")
  })

  test("exports specialized renderers", async () => {
    const mod = await import("../../src/component/tool-renderers")
    expect(mod.BashRenderer).toBeDefined()
    expect(mod.ReadRenderer).toBeDefined()
    expect(mod.WriteRenderer).toBeDefined()
    expect(mod.EditRenderer).toBeDefined()
    expect(mod.GlobRenderer).toBeDefined()
    expect(mod.GrepRenderer).toBeDefined()
    expect(mod.WebFetchRenderer).toBeDefined()
    expect(mod.TaskRenderer).toBeDefined()
    expect(mod.GenericRenderer).toBeDefined()
  })

  test("ToolCallData interface has required fields", async () => {
    const mod = await import("../../src/component/tool-renderers")
    const data: mod.ToolCallData = {
      id: "test-1",
      name: "bash",
      input: '{"command":"ls"}',
      status: "running",
    }
    expect(data.id).toBe("test-1")
    expect(data.name).toBe("bash")
    expect(data.status).toBe("running")
  })
})

describe("ReasoningPart", () => {
  test("exports ReasoningPart component", async () => {
    const mod = await import("../../src/component/reasoning-part")
    expect(mod.ReasoningPart).toBeDefined()
    expect(typeof mod.ReasoningPart).toBe("function")
  })
})
