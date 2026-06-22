#!/usr/bin/env bun
/**
 * Enhanced Judge — 基于 spec 的增强版审查器
 *
 * 在原有启发式检查基础上增加:
 * - 相关性检查（变更文件是否在任务范围内）
 * - 过量改动检测
 * - 安全性检查（eval/exec/密钥泄露）
 * - 完整性检查（对比 spec 需求）
 * - Trace 覆盖检查
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"

const PROJECT_ROOT = join(import.meta.dirname, "../..")

export interface JudgeContext {
  task: {
    id: string
    title: string
    description: string
    specPath?: string
  }
  spec?: string
  diff: string
  changedFiles: string[]
}

export interface JudgeVerdict {
  approved: boolean
  issues: string[]
  suggestions: string[]
}

/**
 * 从任务描述中提取相关文件关键词
 */
function extractRelevantFiles(description: string): string[] {
  const keywords: string[] = []

  // 提取文件路径模式
  const pathPatterns = description.match(/[\w/]+\.(ts|tsx|js|jsx|json|md)/g)
  if (pathPatterns) keywords.push(...pathPatterns)

  // 提取目录关键词
  const dirPatterns = description.match(/(?:src|test|lib|packages)\/[\w/]+/g)
  if (dirPatterns) keywords.push(...dirPatterns)

  // 提取模块名
  const modulePatterns = description.match(/(?:agent|session|config|tool|server|mcp|memory|worktree)/gi)
  if (modulePatterns) keywords.push(...modulePatterns.map(m => m.toLowerCase()))

  return [...new Set(keywords)]
}

/**
 * 安全性检查
 */
function checkSecurity(diff: string): string[] {
  const issues: string[] = []

  // 检查 eval/exec
  if (diff.includes("+") && (diff.includes("eval(") || diff.includes("exec("))) {
    const evalLines = diff.split("\n").filter(l =>
      l.startsWith("+") && (l.includes("eval(") || l.includes("exec("))
    )
    if (evalLines.length > 0) {
      issues.push(`检测到 eval/exec 调用，存在安全风险`)
    }
  }

  // 检查密钥泄露
  const secretPatterns = [
    /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']+["']/i,
    /(?:AKIA|ASIA)[A-Z0-9]{16}/,  // AWS keys
    /sk-[a-zA-Z0-9]{48}/,  // OpenAI keys
    /ghp_[a-zA-Z0-9]{36}/,  // GitHub tokens
  ]

  for (const pattern of secretPatterns) {
    const lines = diff.split("\n").filter(l => l.startsWith("+") && pattern.test(l))
    if (lines.length > 0) {
      issues.push("检测到可能的密钥泄露")
      break
    }
  }

  // 检查危险操作
  const dangerousPatterns = [
    { pattern: /rm\s+-rf/, desc: "rm -rf 命令" },
    { pattern: /process\.exit\(/, desc: "process.exit() 调用" },
    { pattern: /\.env\b/, desc: "访问 .env 文件" },
  ]

  for (const { pattern, desc } of dangerousPatterns) {
    const lines = diff.split("\n").filter(l => l.startsWith("+") && pattern.test(l))
    if (lines.length > 0) {
      issues.push(`检测到危险操作: ${desc}`)
    }
  }

  return issues
}

/**
 * 相关性检查
 */
function checkRelevance(taskDescription: string, changedFiles: string[]): string[] {
  const issues: string[] = []
  const relevantKeywords = extractRelevantFiles(taskDescription)

  if (relevantKeywords.length === 0) return issues

  // 检查是否有变更文件完全不在任务范围内
  const irrelevantFiles = changedFiles.filter(file => {
    const fileLower = file.toLowerCase()
    return !relevantKeywords.some(keyword => fileLower.includes(keyword.toLowerCase()))
  })

  // 允许一些通用文件的变更
  const allowedPatterns = [
    "package.json",
    "tsconfig.json",
    "AGENTS.md",
    "CHANGELOG.md",
    ".mimocode/roadmap.json",
  ]

  const trulyIrrelevant = irrelevantFiles.filter(f =>
    !allowedPatterns.some(p => f.includes(p))
  )

  if (trulyIrrelevant.length > 3) {
    issues.push(`变更了 ${trulyIrrelevant.length} 个可能与任务无关的文件: ${trulyIrrelevant.slice(0, 3).join(", ")}...`)
  }

  return issues
}

/**
 * 过量改动检测
 */
function checkExcessiveChanges(taskDescription: string, changedFiles: string[]): string[] {
  const issues: string[] = []

  // 根据任务描述长度估算复杂度
  const descLength = taskDescription.length
  const maxFiles = descLength < 100 ? 5 : descLength < 500 ? 10 : 20

  if (changedFiles.length > maxFiles) {
    issues.push(`改动文件过多 (${changedFiles.length})，超出任务复杂度预期 (最多 ${maxFiles})`)
  }

  return issues
}

/**
 * 完整性检查（需要 spec）
 */
function checkCompleteness(spec: string, diff: string): string[] {
  const issues: string[] = []

  if (!spec) return issues

  // 提取 spec 中的需求关键词
  const requirementBlocks = spec.split(/^### /m).slice(1)
  const requirements = requirementBlocks.map(block => {
    const name = block.split("\n")[0].trim()
    return {
      name,
      keywords: name.toLowerCase().split(/\s+/).filter(w => w.length > 3),
    }
  })

  // 检查需求是否在 diff 中有体现
  const diffLower = diff.toLowerCase()
  const unmetRequirements = requirements.filter(req => {
    if (req.keywords.length === 0) return false
    return !req.keywords.some(kw => diffLower.includes(kw))
  })

  if (unmetRequirements.length > 0 && unmetRequirements.length === requirements.length) {
    issues.push("代码变更未体现任何 spec 需求")
  }

  return issues
}

/**
 * Trace 覆盖检查
 */
function checkTraceCoverage(changedFiles: string[], diff: string): string[] {
  const issues: string[] = []

  // 只检查新增的源文件（非测试文件）
  const newSourceFiles = changedFiles.filter(f =>
    f.includes("src/") &&
    !f.includes(".test.") &&
    !f.includes(".spec.") &&
    (f.endsWith(".ts") || f.endsWith(".tsx"))
  )

  if (newSourceFiles.length === 0) return issues

  // 检查 diff 中是否有 trace 相关代码
  const hasTrace = diff.includes("TraceNodeEvent") ||
    diff.includes("bus.publish") ||
    diff.includes("TraceReporter") ||
    diff.includes("Span")

  if (!hasTrace && newSourceFiles.length > 2) {
    issues.push(`新增了 ${newSourceFiles.length} 个源文件但缺少 trace 埋点`)
  }

  return issues
}

/**
 * 增强版 Judge 审查
 */
export function judgeWithContext(ctx: JudgeContext): JudgeVerdict {
  const issues: string[] = []
  const suggestions: string[] = []

  // 1. 安全性检查
  const securityIssues = checkSecurity(ctx.diff)
  issues.push(...securityIssues)

  // 2. 相关性检查
  const relevanceIssues = checkRelevance(ctx.task.description, ctx.changedFiles)
  issues.push(...relevanceIssues)

  // 3. 过量改动检测
  const excessiveIssues = checkExcessiveChanges(ctx.task.description, ctx.changedFiles)
  issues.push(...excessiveIssues)

  // 4. 完整性检查
  if (ctx.spec) {
    const completenessIssues = checkCompleteness(ctx.spec, ctx.diff)
    issues.push(...completenessIssues)
  }

  // 5. Trace 覆盖检查
  const traceIssues = checkTraceCoverage(ctx.changedFiles, ctx.diff)
  suggestions.push(...traceIssues)

  return {
    approved: issues.length === 0,
    issues,
    suggestions,
  }
}

/**
 * 从 scheduler 调用的入口
 */
export function runEnhancedJudge(taskId: string, taskTitle: string, taskDescription: string, specPath?: string): JudgeVerdict {
  // 获取变更文件
  let changedFiles: string[] = []
  let diff = ""

  try {
    const statusOutput = execSync("git status --porcelain", {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    })
    changedFiles = statusOutput
      .split("\n")
      .filter(l => l.trim())
      .map(l => l.slice(3).trim())

    const diffOutput = execSync("git diff HEAD --unified=3", {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    })
    const diffStaged = execSync("git diff --cached --unified=3", {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
    })
    diff = diffOutput + "\n" + diffStaged
  } catch {
    // git 命令失败，跳过检查
    return { approved: true, issues: [], suggestions: [] }
  }

  // 读取 spec
  let spec: string | undefined
  if (specPath && existsSync(specPath)) {
    spec = readFileSync(specPath, "utf-8")
  }

  return judgeWithContext({
    task: {
      id: taskId,
      title: taskTitle,
      description: taskDescription,
      specPath,
    },
    spec,
    diff,
    changedFiles,
  })
}

// ============ CLI ============

async function main() {
  console.log("Enhanced Judge - 测试模式")
  console.log("=".repeat(40))

  const verdict = runEnhancedJudge(
    "TEST-1",
    "测试任务",
    "实现一个测试功能，修改 src/test.ts 文件"
  )

  console.log(`\n审查结果: ${verdict.approved ? "✅ 通过" : "❌ 未通过"}`)

  if (verdict.issues.length > 0) {
    console.log("\n问题:")
    for (const issue of verdict.issues) {
      console.log(`  - ${issue}`)
    }
  }

  if (verdict.suggestions.length > 0) {
    console.log("\n建议:")
    for (const s of verdict.suggestions) {
      console.log(`  - ${s}`)
    }
  }
}

// 只在直接运行时执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
