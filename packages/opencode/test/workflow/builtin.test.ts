import { describe, expect, test } from "bun:test"
import { BuiltinWorkflow } from "../../src/workflow/builtin"

describe("BuiltinWorkflow registry", () => {
  test("lists deep-research with parsed meta", () => {
    const list = BuiltinWorkflow.list()
    const dr = list.find((w) => w.name === "deep-research")
    expect(dr).toBeDefined()
    expect(dr!.description).toContain("Deep research")
    expect(dr!.whenToUse).toContain("multi-source")
  })

  test("lists auto-loop with parsed meta", () => {
    const list = BuiltinWorkflow.list()
    const al = list.find((w) => w.name === "auto-loop")
    expect(al).toBeDefined()
    expect(al!.description).toContain("Autonomous engineering loop")
    expect(al!.whenToUse).toContain("self-healing")
    expect(al!.phases).toHaveLength(5)
    expect(al!.phases!.map(p => p.title)).toEqual(["Plan", "Execute", "Test", "Heal", "Distill"])
  })

  test("get returns the script body starting with export const meta", () => {
    const dr = BuiltinWorkflow.get("deep-research")
    expect(dr).toBeDefined()
    expect(dr!.script.startsWith("export const meta")).toBe(true)
    
    const al = BuiltinWorkflow.get("auto-loop")
    expect(al).toBeDefined()
    expect(al!.script.startsWith("export const meta")).toBe(true)
  })

  test("get returns undefined for an unknown name", () => {
    expect(BuiltinWorkflow.get("nope")).toBeUndefined()
  })
})
