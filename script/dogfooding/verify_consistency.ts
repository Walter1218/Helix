import path from "path"
import * as fs from "fs/promises"
const loop = await fs.readFile("script/dogfooding/beta_evolution_loop.ts", "utf-8")
const dpo = await fs.readFile("script/dogfooding/export_dpo.ts", "utf-8")
const reg = await fs.readFile("packages/opencode/src/tool/registry.ts", "utf-8")

console.log("success_traces in loop:", loop.includes("success_traces"))
console.log("failed_traces in loop:", loop.includes("failed_traces"))
console.log("success_traces in dpo:", dpo.includes("success_traces"))
console.log("failed_traces in dpo:", dpo.includes("failed_traces"))
console.log("observerLog in loop:", loop.includes("observerLog"))
console.log("observerLog in dpo:", dpo.includes("observerLog"))
console.log("passed.json in loop:", loop.includes("passed.json"))
console.log("-failed.json in loop:", loop.includes("-failed.json"))
console.log("Screenshot in registry:", reg.includes("ScreenshotTool"))
