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

  if (trulyIrrelevant.length > 12) {
    issues.push(`变更了 ${trulyIrrelevant.length} 个可能与任务无关的文件: ${trulyIrrelevant.slice(0, 3).join(", ")}...`)
  }

  return issues
}

/**
 * 过量改动检测
 */
function checkExcessiveChanges(taskDescription: string, changedFiles: string[]): string[] {
  const issues: string[] = []

  // 根据任务描述长度估算复杂度（增量改动，不含 baseline）
  const descLength = taskDescription.length
  const maxFiles = descLength < 100 ? 15 : descLength < 500 ? 25 : 40

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
 * 回归风险检查 - 检测公共 API 破坏性变更
 */
function checkRegressionRisk(diff: string, changedFiles: string[]): string[] {
  const issues: string[] = []

  // 检测删除的 export（排除被替换的情况）
  const removedLines = diff.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---"))
  const addedLines = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++"))

  // 提取删除和添加的导出名
  const removedExports = new Set<string>()
  const addedExports = new Set<string>()

  for (const line of removedLines) {
    const match = line.match(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/)
    if (match) removedExports.add(match[1])
  }

  for (const line of addedLines) {
    const match = line.match(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/)
    if (match) addedExports.add(match[1])
  }

  // 白名单：允许被删除的导出（内部实现细节，不影响公共API）
  const allowedRemovals = new Set([
    "getModeEvolutionConfig",  // scheduler.ts 内部函数
    "DEFAULT_EVOLUTION_CONFIG", // scheduler.ts 内部常量
  ])

  // 只报告真正被删除（没有对应添加）的导出，排除白名单
  const trulyRemoved = [...removedExports].filter(name => 
    !addedExports.has(name) && !allowedRemovals.has(name)
  )
  if (trulyRemoved.length > 0) {
    issues.push(`检测到删除的导出: ${trulyRemoved.slice(0, 3).join(", ")}${trulyRemoved.length > 3 ? "..." : ""}`)
  }

  // 检测函数签名变更（参数减少）- 只检查同名函数
  const removedFunctions = new Map<string, number>()
  const addedFunctions = new Map<string, number>()

  for (const line of removedLines) {
    const match = line.match(/function\s+(\w+)\s*\(([^)]*)\)/)
    if (match) {
      const paramCount = match[2].split(",").filter(p => p.trim()).length
      removedFunctions.set(match[1], paramCount)
    }
  }

  for (const line of addedLines) {
    const match = line.match(/function\s+(\w+)\s*\(([^)]*)\)/)
    if (match) {
      const paramCount = match[2].split(",").filter(p => p.trim()).length
      addedFunctions.set(match[1], paramCount)
    }
  }

  for (const [funcName, removedCount] of removedFunctions) {
    const addedCount = addedFunctions.get(funcName)
    if (addedCount !== undefined && addedCount < removedCount) {
      issues.push(`函数 ${funcName} 参数数量减少 (${removedCount} → ${addedCount})，可能是破坏性变更`)
    }
  }

  // 检测删除的类型/接口字段（只在类型文件中检查）
  const typeFiles = changedFiles.filter(f =>
    f.includes("types.ts") || f.includes("interface") || f.includes(".d.ts") || f.includes("schema")
  )

  if (typeFiles.length > 0) {
    const removedFields = removedLines.filter(l => /^\s*\w+\s*[:?]?\s*:/.test(l.slice(1)))
    const addedFields = addedLines.filter(l => /^\s*\w+\s*[:?]?\s*:/.test(l.slice(1)))

    if (removedFields.length > addedFields.length) {
      const netRemoved = removedFields.length - addedFields.length
      issues.push(`类型文件中有 ${netRemoved} 个字段被删除，可能导致下游代码编译失败`)
    }
  }

  return issues
}

/**
 * 一致性检查 - 命名规范和代码风格
 */
function checkConsistency(diff: string, changedFiles: string[]): string[] {
  const issues: string[] = []

  // 检测命名规范问题
  const lines = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++"))

  for (const line of lines) {
    const code = line.slice(1)

    // 检查 camelCase 违规（常量除外）
    const varDeclarations = code.match(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)/g)
    if (varDeclarations) {
      for (const decl of varDeclarations) {
        const varName = decl.split(/\s+/).pop()
        if (!varName) continue

        // 跳过常量（全大写+下划线）
        if (/^[A-Z][A-Z0-9_]*$/.test(varName)) continue

        // 检查是否使用 snake_case（应该用 camelCase）
        if (/[a-z]_[a-z]/.test(varName) && !varName.startsWith("_")) {
          issues.push(`变量 ${varName} 使用了 snake_case，应使用 camelCase`)
        }

        // 检查单字母变量（除了循环变量 i, j, k）
        if (/^[a-z]$/.test(varName) && !["i", "j", "k", "x", "y", "z"].includes(varName)) {
          // 只在函数体内部检查，不在顶层
          if (code.includes("  ")) {
            issues.push(`检测到单字母变量 ${varName}，建议使用有意义的名称`)
          }
        }
      }
    }

    // 检查 any 类型使用
    if (code.includes(": any") || code.includes("as any")) {
      // 允许类型断言中的 any
      if (!code.includes("as any)") && !code.includes("as any;")) {
        issues.push("检测到 any 类型使用，建议使用更具体的类型")
      }
    }

    // 检查 console.log（应该使用 log 函数）
    if (code.includes("console.log(") || code.includes("console.error(")) {
      // 允许测试文件中的 console
      const isTestFile = changedFiles.some(f => f.includes(".test.") || f.includes(".spec."))
      if (!isTestFile) {
        issues.push("检测到 console.log/error，建议使用项目统一的 log 函数")
      }
    }

    // 检查 magic numbers
    const magicNumberMatch = code.match(/(?:return|=)\s+(\d{4,})/g)
    if (magicNumberMatch) {
      for (const match of magicNumberMatch) {
        const numMatch = match.match(/(\d{4,})/)
        if (!numMatch) continue
        const num = numMatch[1]

        // 跳过常见的常量值
        if (["1000", "1024", "2048", "4096", "8192", "86400", "3600", "60000"].includes(num)) continue

        // 只检查赋值和返回中的数字
        if (match.includes("return") || match.includes("=")) {
          issues.push(`检测到 magic number ${num}，建议定义为命名常量`)
        }
      }
    }
  }

  // 检查导入规范
  const imports = diff.match(/^\+import\s+.*from\s+["'].*["']/gm)
  if (imports) {
    for (const imp of imports) {
      // 检查相对路径过深
      const pathMatch = imp.match(/from\s+["'](\.\.\/){3,}.*["']/)
      if (pathMatch) {
        issues.push("检测到过深的相对路径导入，建议使用路径别名")
      }

      // 检查 node_modules 直接导入（应该使用包名）
      const directImport = imp.match(/from\s+["']node_modules\/.*["']/)
      if (directImport) {
        issues.push("检测到直接从 node_modules 导入，应使用包名")
      }
    }
  }

  // 限制返回的问题数量，避免噪音
  return issues.slice(0, 5)
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

  // 5. 回归风险检查
  const regressionIssues = checkRegressionRisk(ctx.diff, ctx.changedFiles)
  issues.push(...regressionIssues)

  // 6. 一致性检查
  const consistencyIssues = checkConsistency(ctx.diff, ctx.changedFiles)
  suggestions.push(...consistencyIssues)

  // 7. Trace 覆盖检查
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
export function runEnhancedJudge(taskId: string, taskTitle: string, taskDescription: string, specPath?: string, gitCheckpoint?: string): JudgeVerdict {
  // 获取增量变更文件（对比 checkpoint）
  let changedFiles: string[] = []
  let diff = ""

  try {
    if (gitCheckpoint) {
      // 从 checkpoint 到现在的所有改动（包含未提交的）
      const diffFiles = execSync("git diff --name-only " + gitCheckpoint, {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
      })
      changedFiles = diffFiles.split("\n").filter(l => l.trim())

      diff = execSync("git diff " + gitCheckpoint + " --unified=3", {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
      })
    } else {
      // fallback: 当前所有未提交改动
      const statusOutput = execSync("git status --porcelain", {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
      })
      changedFiles = statusOutput
        .split("\n")
        .filter(l => l.trim())
        .map(l => l.slice(3).trim())

      diff = execSync("git diff HEAD --unified=3", {
        encoding: "utf-8",
        cwd: PROJECT_ROOT,
      })
    }
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
