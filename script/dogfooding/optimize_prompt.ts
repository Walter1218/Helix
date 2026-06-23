import { file } from "bun"
import path from "path"
import fs from "fs/promises"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

declare const Bun: any

const DSPY_PROMPT = `You are the Helix DSPy Optimizer (Meta-Cognitive Agent).
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
- **[Rule Title]**: [Actionable instruction]`

interface TraceData {
  id: string
  description?: string
  error?: string
  trajectory?: string
  [key: string]: unknown
}

function loadConfig(): { baseUrl: string; apiKey: string; model: string } {
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) {
    throw new Error("MIMO_API_KEY 环境变量未设置。请在 ~/.config/mimocode/mimocode.json 或 .env 中配置。")
  }

  const baseUrl = process.env.MIMO_BASE_URL ?? "https://token-plan-cn.xiaomimimo.com/v1"
  const model = process.env.MIMO_MODEL ?? "xiaomi/mimo-v2.5-pro"

  return { baseUrl, apiKey, model }
}

async function callLLM(baseUrl: string, apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LLM API 调用失败 (${response.status}): ${body}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("LLM 返回空内容")
  }

  return content.trim()
}

function parseRuleFromResponse(response: string): string {
  const lines = response.split("\n").filter((l) => l.trim())

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- **") || trimmed.startsWith("- ")) {
      return trimmed
    }
  }

  const firstLine = lines[0]
  if (firstLine && firstLine.length < 300) {
    return `- ${firstLine}`
  }

  throw new Error(`无法从 LLM 响应中提取规则:\n${response.slice(0, 200)}`)
}

async function loadTraces(dir: string): Promise<TraceData[]> {
  const traces: TraceData[] = []
  try {
    const files = await fs.readdir(dir)
    for (const f of files) {
      if (!f.endsWith(".json")) continue
      try {
        const data = await file(path.join(dir, f)).json() as TraceData
        traces.push(data)
      } catch {
        console.warn(`${YELLOW}⚠ 跳过无效文件: ${f}${RESET}`)
      }
    }
  } catch {
    // 目录不存在
  }
  return traces
}

async function optimizePrompts(dryRun: boolean) {
  console.log(`\n${BLUE}🚀 启动 DSPy 离线 Prompt 优化器 (Phase 2: 敏捷进化)...${RESET}`)

  const failedTracesDir = path.resolve(".dogfooding/failed_traces")
  await fs.mkdir(failedTracesDir, { recursive: true })

  const traces = await loadTraces(failedTracesDir)
  if (traces.length === 0) {
    console.log(`${GREEN}✅ 无失败的干净 Trace，无需进化。${RESET}`)
    return
  }

  console.log(`${BLUE}📂 发现 ${traces.length} 条失败 Trace${RESET}`)

  const agentsPath = path.resolve("AGENTS.md")
  let currentRules = ""
  if (await file(agentsPath).exists()) {
    currentRules = await file(agentsPath).text()
  } else {
    await Bun.write(agentsPath, "# Helix Agents Global Rules\n\n")
    currentRules = "# Helix Agents Global Rules\n\n"
  }

  let config: { baseUrl: string; apiKey: string; model: string }
  try {
    config = loadConfig()
    console.log(`${BLUE}📡 使用模型: ${config.model}${RESET}`)
  } catch (e) {
    console.error(`${RED}❌ ${e}${RESET}`)
    process.exit(1)
  }

  let successCount = 0
  let failCount = 0

  for (const trace of traces) {
    const traceId = trace.id ?? "unknown"
    console.log(`${YELLOW}▶ 分析失败 Trace: ${traceId}${RESET}`)

    const traceText = [
      trace.error ? `Error: ${trace.error}` : "",
      trace.description ? `Description: ${trace.description}` : "",
      trace.trajectory ? `Trajectory: ${trace.trajectory}` : "",
    ].filter(Boolean).join("\n")

    if (!traceText.trim()) {
      console.warn(`${YELLOW}⚠ Trace ${traceId} 无有效内容，跳过${RESET}`)
      continue
    }

    const prompt = DSPY_PROMPT
      .replace("{TRACE}", traceText)
      .replace("{CURRENT_RULES}", currentRules.slice(0, 3000))

    console.log(`${BLUE}🧠 触发 LLM 反思与规则蒸馏...${RESET}`)

    try {
      const response = await callLLM(config.baseUrl, config.apiKey, config.model, prompt)
      const rule = parseRuleFromResponse(response)

      console.log(`${GREEN}💡 提取到新规则: ${rule}${RESET}`)

      if (dryRun) {
        console.log(`${YELLOW}[dry-run] 跳过写入 AGENTS.md${RESET}`)
      } else {
        currentRules += `\n${rule}\n`
        await Bun.write(agentsPath, currentRules)
        console.log(`${GREEN}✅ 规则已写入 AGENTS.md${RESET}`)

        await fs.unlink(path.join(failedTracesDir, `${traceId}.json`)).catch(() => {})
      }

      successCount++
    } catch (e) {
      console.error(`${RED}❌ 规则提取失败 (${traceId}): ${e}${RESET}`)
      failCount++
    }
  }

  console.log(`\n${BLUE}==========================================${RESET}`)
  console.log(`📊 DSPy 离线 Prompt 优化器执行完毕`)
  console.log(`  成功: ${successCount}  失败: ${failCount}`)
  console.log(`${BLUE}==========================================${RESET}`)
}

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")

void optimizePrompts(dryRun)
