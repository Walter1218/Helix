#!/usr/bin/env bun
/**
 * Spec Writer — 任务执行后更新 spec 状态
 *
 * 用法:
 *   bun run script/auto-dev/spec-writer.ts <specPath> <requirement> <success> [output]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs"
import { join } from "path"

export interface SpecUpdateResult {
  specPath: string
  requirement: string
  success: boolean
  output: string
  tokensUsed: number
}

/**
 * 更新 spec 文件中指定需求的状态
 */
export function updateSpecStatus(
  specPath: string,
  requirement: string,
  result: { success: boolean; output: string; tokensUsed: number }
): boolean {
  if (!existsSync(specPath)) {
    console.error(`Spec 文件不存在: ${specPath}`)
    return false
  }

  let content = readFileSync(specPath, "utf-8")
  const lines = content.split("\n")
  const newLines: string[] = []

  let inTargetRequirement = false
  let requirementFound = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 检测是否进入目标需求段落
    if (line.startsWith("### ") && line.includes(requirement)) {
      inTargetRequirement = true
      requirementFound = true
      newLines.push(line)
      continue
    }

    // 检测是否离开目标需求段落（遇到新的 ### 或 ##）
    if (inTargetRequirement && (line.startsWith("### ") || line.startsWith("## "))) {
      // 在离开前插入状态信息
      const date = new Date().toISOString().slice(0, 10)
      const statusIcon = result.success ? "✅" : "❌"
      const statusText = result.success ? "implemented" : "failed"

      newLines.push("")
      newLines.push(`**Status**: ${statusIcon} ${statusText} (${date})`)
      newLines.push(`**Tokens**: ${result.tokensUsed.toLocaleString()}`)

      if (!result.success && result.output) {
        const shortOutput = result.output.slice(0, 200).replace(/\n/g, " ")
        newLines.push(`**Notes**: ${shortOutput}`)
      }

      newLines.push("")
      inTargetRequirement = false
    }

    // 跳过已有的 Status 行（在目标需求内）
    if (inTargetRequirement && line.startsWith("**Status**:")) {
      continue
    }
    if (inTargetRequirement && line.startsWith("**Tokens**:")) {
      continue
    }
    if (inTargetRequirement && line.startsWith("**Notes**:")) {
      continue
    }

    newLines.push(line)
  }

  // 如果目标需求在文件末尾
  if (inTargetRequirement) {
    const date = new Date().toISOString().slice(0, 10)
    const statusIcon = result.success ? "✅" : "❌"
    const statusText = result.success ? "implemented" : "failed"

    newLines.push("")
    newLines.push(`**Status**: ${statusIcon} ${statusText} (${date})`)
    newLines.push(`**Tokens**: ${result.tokensUsed.toLocaleString()}`)

    if (!result.success && result.output) {
      const shortOutput = result.output.slice(0, 200).replace(/\n/g, " ")
      newLines.push(`**Notes**: ${shortOutput}`)
    }
  }

  if (!requirementFound) {
    console.error(`未找到需求: ${requirement}`)
    return false
  }

  writeFileSync(specPath, newLines.join("\n"))
  console.log(`已更新 spec: ${specPath}`)
  console.log(`  需求: ${requirement}`)
  console.log(`  状态: ${result.success ? "✅ implemented" : "❌ failed"}`)
  return true
}

/**
 * 根据任务描述查找对应的 spec 文件和需求
 */
export function findSpecForTask(
  taskDescription: string,
  specsDir: string
): { specPath: string; requirement: string } | null {
  if (!existsSync(specsDir)) return null

  const taskLower = taskDescription.toLowerCase()

  // 定义关键词映射
  const keywordMap: Record<string, string[]> = {
    "auth-session": ["认证", "auth", "session", "会话", "登录", "login", "过期", "expir", "remember"],
    "auto-dev": ["自动", "auto", "调度", "schedul", "开发", "dev", "pipeline", "任务执行"],
    "judge-agent": ["judge", "裁判", "审查", "review", "断言", "assertion", "保护", "protect"],
    "feishu-gateway": ["飞书", "feishu", "消息", "message", "通知", "notify", "推送", "push", "桥接"],
  }

  const dirs = readdirSync(specsDir).filter((d: string) => {
    const fullPath = join(specsDir, d)
    return statSync(fullPath).isDirectory()
  })

  // 第一轮：基于关键词映射匹配
  for (const dir of dirs) {
    const keywords = keywordMap[dir]
    if (!keywords) continue

    const matchCount = keywords.filter(kw => taskLower.includes(kw)).length
    if (matchCount >= 1) {
      const specPath = join(specsDir, dir, "spec.md")
      if (existsSync(specPath)) {
        const content = readFileSync(specPath, "utf-8")
        // 找到第一个 pending 的需求
        const pendingMatch = content.match(/^### (.+)\n[^\n]*\n\n\*\*Status\*\*: pending/m)
        if (pendingMatch) {
          return { specPath, requirement: pendingMatch[1].trim() }
        }
        // 如果没有 pending 的，返回第一个需求
        const reqMatch = content.match(/^### (.+)/m)
        if (reqMatch) {
          return { specPath, requirement: reqMatch[1].trim() }
        }
      }
    }
  }

  // 第二轮：基于目录名分词匹配
  for (const dir of dirs) {
    const dirLower = dir.toLowerCase()
    const dirWords = dirLower.split("-")

    const matchCount = dirWords.filter(w => taskLower.includes(w)).length
    if (matchCount >= dirWords.length * 0.5) {
      const specPath = join(specsDir, dir, "spec.md")
      if (existsSync(specPath)) {
        const content = readFileSync(specPath, "utf-8")
        const reqMatch = content.match(/^### (.+)/m)
        if (reqMatch) {
          return { specPath, requirement: reqMatch[1].trim() }
        }
      }
    }
  }

  // 第三轮：基于需求名称匹配
  for (const dir of dirs) {
    const specPath = join(specsDir, dir, "spec.md")
    if (!existsSync(specPath)) continue

    const content = readFileSync(specPath, "utf-8")
    const requirementBlocks = content.split(/^### /m).slice(1)

    for (const block of requirementBlocks) {
      const reqName = block.split("\n")[0].trim()
      const reqLower = reqName.toLowerCase()
      const reqWords = reqLower.split(/\s+/).filter((w: string) => w.length > 3)

      const matchCount = reqWords.filter((w: string) => taskLower.includes(w)).length
      if (matchCount >= reqWords.length * 0.5) {
        return { specPath, requirement: reqName }
      }
    }
  }

  return null
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.log("用法: bun run script/auto-dev/spec-writer.ts <specPath> <requirement> <success> [output]")
    console.log("")
    console.log("示例:")
    console.log('  bun run script/auto-dev/spec-writer.ts openspec/specs/auth-session/spec.md "Session expiration" true')
    process.exit(1)
  }

  const [specPath, requirement, successStr, ...outputParts] = args
  const success = successStr === "true"
  const output = outputParts.join(" ")

  const result = updateSpecStatus(specPath, requirement, {
    success,
    output,
    tokensUsed: 0,
  })

  process.exit(result ? 0 : 1)
}

// 只在直接运行时执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
