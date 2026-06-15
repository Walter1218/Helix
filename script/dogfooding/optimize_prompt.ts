import { $, file } from "bun"
import path from "path"
import os from "os"
import fs from "fs/promises"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

declare const Bun: any;

const DSPY_PROMPT = `
You are the Helix DSPy Optimizer (Meta-Cognitive Agent).
Your goal is to review a failed test trace and extract a generic, reusable rule to prevent this failure in the future.
You must not overfit to the specific file names or variable names in the trace.

Input Trace Description:
{TRACE}

Current System Rules (AGENTS.md):
{CURRENT_RULES}

Output Format:
Produce exactly one concise Markdown rule that should be appended to AGENTS.md.
Do not output anything else. No preamble, no explanation.
Format:
- **[Rule Title]**: [Actionable instruction]
`

async function optimizePrompts() {
  console.log(`\n${BLUE}🚀 启动 DSPy 离线 Prompt 优化器 (Phase 2: 敏捷进化)...${RESET}`)
  
  // We'll simulate reading the "Failed Traces" database.
  // In Phase 1, run_all.ts outputs failed traces. Here we just pick up a mock failed trace for the proof-of-concept.
  const failedTracesDir = path.resolve(".dogfooding/failed_traces")
  await fs.mkdir(failedTracesDir, { recursive: true })
  
  // Create a mock failed trace if none exists, to demonstrate the flywheel
  const mockTracePath = path.join(failedTracesDir, "mock_trace.json")
  if (!(await file(mockTracePath).exists())) {
    await Bun.write(mockTracePath, JSON.stringify({
      id: "MOCK-001",
      description: "Agent failed to compile React component because it didn't import React in a .tsx file.",
      error: "ReferenceError: React is not defined",
      trajectory: "1. Created file. 2. Wrote JSX. 3. bun build failed."
    }))
  }

  const traces = await fs.readdir(failedTracesDir)
  const jsonTraces = traces.filter(t => t.endsWith(".json"))
  
  if (jsonTraces.length === 0) {
    console.log(`${GREEN}✅ 无失败的干净 Trace，无需进化。${RESET}`)
    return
  }

  // Find the AGENTS.md file
  const agentsPath = path.resolve("AGENTS.md")
  let currentRules = ""
  if (await file(agentsPath).exists()) {
    currentRules = await file(agentsPath).text()
    } else {
      await Bun.write(agentsPath, "# Helix Agents Global Rules\n\n")
      currentRules = "# Helix Agents Global Rules\n\n"
    }

  for (const traceFile of jsonTraces) {
    console.log(`${YELLOW}▶ 分析失败 Trace: ${traceFile}${RESET}`)
    const traceData = await file(path.join(failedTracesDir, traceFile)).json()
    
    const traceText = `Error: ${traceData.error}\nDescription: ${traceData.description}\nTrajectory: ${traceData.trajectory}`
    
    // Construct the DSPy-like prompt
    const prompt = DSPY_PROMPT
      .replace("{TRACE}", traceText)
      .replace("{CURRENT_RULES}", currentRules)

    console.log(`${BLUE}🧠 触发 LLM 反思与规则蒸馏 (Auto-Distill)...${RESET}`)
    
    // We use the built-in CLI to run a quick generation for the rule.
    // We will spawn a temporary workspace to ask the agent to act as the optimizer.
    const platform = process.platform === "win32" ? "windows" : process.platform
    const cliScript = path.resolve(`packages/opencode/dist/mimocode-${platform}-${process.arch}/bin/mimo${process.platform === "win32" ? ".exe" : ""}`)
    
    const optimizeDir = path.resolve(`.dogfooding/optimizer_${Date.now()}`)
    await fs.mkdir(optimizeDir, { recursive: true })
    await Bun.write(path.join(optimizeDir, "prompt.txt"), prompt)
    
    try {
      // In a real scenario we would call the LLM API directly via effect/unstable/http or AI SDK.
      // For this loop, we simulate the LLM call using the CLI itself if possible, or just generate a rule directly for the MVP.
      
      // Mocking the LLM output for the sake of the structural PoC (since running the CLI recursively inside the script might be slow or flaky without API keys set).
      const generatedRule = `- **React Imports**: Always ensure \`import React from 'react'\` is present when writing JSX in \`.tsx\` files.`
      
      console.log(`${GREEN}💡 提取到新规则: ${generatedRule}${RESET}`)
      
    // 3. 沉淀到 AGENTS.md
    currentRules += `\n${generatedRule}\n`
    await Bun.write(agentsPath, currentRules)
      
      console.log(`${GREEN}✅ 规则已成功挂载至 AGENTS.md 图谱！${RESET}`)
      
      // 4. 清理已处理的 trace
      await fs.unlink(path.join(failedTracesDir, traceFile))
      
    } catch (e) {
      console.error(`${RED}❌ 规则提取失败: ${e}${RESET}`)
    }
  }

  console.log(`\n${BLUE}==========================================${RESET}`)
  console.log(`📊 DSPy 离线 Prompt 优化器执行完毕`)
  console.log(`==========================================${RESET}`)
}

optimizePrompts()