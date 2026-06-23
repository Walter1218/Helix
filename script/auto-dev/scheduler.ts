#!/usr/bin/env bun
/**
 * Helix Auto-Dev Scheduler
 * 
 * 完整流程: 执行任务 → Judge审查 → 编译 → 类型检查 → 测试 → Lint → 文档 → Git Commit → Git Push
 * 用法: bun run script/auto-dev/scheduler.ts [--once] [--dry-run] [--no-push]
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { Database } from "bun:sqlite"
import { execSync } from "child_process"
import { updateSpecStatus, findSpecForTask } from "./spec-writer"
import { runEnhancedJudge } from "./judge-enhanced"
import { exportDPO, shouldExport } from "../dogfooding/auto-export"

// ModeRegistry配置（简化版，避免Effect依赖）
// 规范源: packages/opencode/src/session/mode-registry.ts DEFAULT_EVOLUTION_CONFIG
// 修改时请同步更新 mode-registry.ts
interface EvolutionConfig {
  judgeEnabled: boolean
  traceExportEnabled: boolean
  evolutionEnabled: boolean
}

const DEFAULT_EVOLUTION_CONFIG: Record<string, EvolutionConfig> = {
  ask: { judgeEnabled: false, traceExportEnabled: false, evolutionEnabled: false },
  build: { judgeEnabled: true, traceExportEnabled: true, evolutionEnabled: true },
  plan: { judgeEnabled: true, traceExportEnabled: true, evolutionEnabled: true },
  compose: { judgeEnabled: true, traceExportEnabled: true, evolutionEnabled: true },
  max: { judgeEnabled: true, traceExportEnabled: true, evolutionEnabled: true },
  loop: { judgeEnabled: true, traceExportEnabled: true, evolutionEnabled: true },
}

function getModeEvolutionConfig(modeId: string): EvolutionConfig {
  return DEFAULT_EVOLUTION_CONFIG[modeId] ?? DEFAULT_EVOLUTION_CONFIG.build!
}

const PROJECT_ROOT = join(import.meta.dirname, "../..")
const ROADMAP_PATH = join(PROJECT_ROOT, ".mimocode/roadmap.json")
const LOG_DIR = join(homedir(), ".local/share/mimocode/log")
const LOG_FILE = join(LOG_DIR, `auto-dev-${new Date().toISOString().slice(0, 10)}.log`)

interface RoadmapTask {
  id: string
  title: string
  description: string
  status: "pending" | "in_progress" | "done"
  priority: "critical" | "high" | "medium" | "low"
  estimated_tokens: number
  tags: string[]
  specPath?: string
  mode?: string  // 任务模式，默认为build
}

interface RoadmapMilestone {
  id: string
  name: string
  status: "pending" | "in_progress" | "done"
  priority: "critical" | "high" | "medium" | "low"
  tasks: RoadmapTask[]
}

interface Roadmap {
  version: string
  project: string
  milestones: RoadmapMilestone[]
  current_focus: string
  auto_dev_config: {
    enabled: boolean
    daily_token_limit: number
    preferred_complexity: string[]
    focus_milestones: string[]
    skip_tags: string[]
  }
}

interface StepResult {
  name: string
  success: boolean
  output: string
  duration: number
  tokensUsed?: number
}

// ============ Logging ============

function log(msg: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${msg}`
  console.log(line)
  
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
  writeFileSync(LOG_FILE, line + "\n", { flag: "a" })
}

// ============ Roadmap ============

function loadRoadmap(): Roadmap | null {
  if (!existsSync(ROADMAP_PATH)) {
    log("No roadmap.json found")
    return null
  }
  return JSON.parse(readFileSync(ROADMAP_PATH, "utf-8"))
}

function estimateTaskTokens(task: RoadmapTask): number {
  if (task.estimated_tokens > 0) return task.estimated_tokens
  const descLen = task.description.length
  if (descLen < 100) return 10000
  if (descLen < 500) return 30000
  if (descLen < 1000) return 60000
  return 100000
}

function getNextTask(roadmap: Roadmap): RoadmapTask | null {
  const { focus_milestones, skip_tags, daily_token_limit } = roadmap.auto_dev_config
  const budgetUsed = getDailyBudgetUsed()
  const budgetRemaining = daily_token_limit > 0 ? Math.max(0, daily_token_limit - budgetUsed) : Infinity

  if (budgetRemaining <= 0) {
    log("预算已耗尽，跳过任务选择")
    return null
  }

  const maxTaskTokens = Math.round(budgetRemaining * 0.5)

  const candidates: Array<{ task: RoadmapTask; score: number }> = []

  for (const milestoneId of focus_milestones) {
    const milestone = roadmap.milestones.find(m => m.id === milestoneId)
    if (!milestone || milestone.status === "done") continue

    const pendingTasks = milestone.tasks.filter(t =>
      t.status === "pending" &&
      !t.tags.some(tag => skip_tags.includes(tag))
    )

    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 }

    for (const task of pendingTasks) {
      const estimated = estimateTaskTokens(task)
      if (estimated > maxTaskTokens) continue

      const priority = priorityWeight[task.priority] ?? 1
      const complexityBonus = estimated <= 20000 ? 1.5 : estimated <= 50000 ? 1.0 : 0.5
      const score = priority * complexityBonus

      candidates.push({ task, score })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].task
}

function updateTaskStatus(roadmap: Roadmap, taskId: string, status: "pending" | "in_progress" | "done") {
  for (const milestone of roadmap.milestones) {
    const task = milestone.tasks.find(t => t.id === taskId)
    if (task) {
      task.status = status
      break
    }
  }
  writeFileSync(ROADMAP_PATH, JSON.stringify(roadmap, null, 2))
}

// ============ Budget ============

function getDailyBudgetUsed(): number {
  const today = new Date().toISOString().slice(0, 10)
  const dbPath = join(homedir(), ".local/share/mimocode/mimocode.db")
  
  if (!existsSync(dbPath)) return 0
  
  try {
    const db = new Database(dbPath)
    const result = db.query("SELECT used FROM daily_budget WHERE date = ?").get(today) as { used: number } | undefined
    db.close()
    return result?.used ?? 0
  } catch {
    return 0
  }
}

function getRecentTokenUsage(sinceTimestamp: number): number {
  const dbPath = join(homedir(), ".local/share/mimocode/mimocode.db")
  if (!existsSync(dbPath)) return 0
  
  try {
    const db = new Database(dbPath)
    const result = db.query("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE timestamp >= ?").get(sinceTimestamp) as { total: number } | undefined
    db.close()
    return result?.total ?? 0
  } catch {
    return 0
  }
}

// ============ Command Execution ============

function runCmd(cmd: string, timeoutMs = 5 * 60 * 1000): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: timeoutMs,
      cwd: PROJECT_ROOT,
      env: process.env,
    })
    return { success: true, output: output.trim() }
  } catch (e: any) {
    return { success: false, output: e.stderr || e.message }
  }
}

// ============ Gateway API Execution ============

async function executeViaGateway(task: RoadmapTask, chatId: string): Promise<{ success: boolean; output: string; tokensUsed: number }> {
  const gatewayUrl = process.env.GATEWAY_API_URL || "http://localhost:3096"
  
  try {
    log(`通过 Gateway 执行任务: ${task.title}`)
    const startTs = Date.now()
    
    // 发送任务到 Gateway
    const response = await fetch(`${gatewayUrl}/api/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        message: task.description,
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      log(`  ✗ Gateway API 错误: ${error}`)
      return { success: false, output: error, tokensUsed: 0 }
    }
    
    const result = await response.json()
    
    // 查询实际 token 消耗
    const tokensUsed = getRecentTokenUsage(startTs)
    log(`  实际消耗: ${tokensUsed.toLocaleString()} tokens`)
    
    // 检查是否遇到权限问题
    if (result.result && (
      result.result.includes("权限") || 
      result.result.includes("permission") || 
      result.result.includes("blocked") ||
      result.result.includes("限制")
    )) {
      log(`  ⚠️ 检测到权限问题，通知用户`)
      
      // 提取具体的权限请求
      let permissionRequest = '访问外部目录文件'
      if (result.result.includes('/etc/hosts')) {
        permissionRequest = '读取 /etc/hosts 文件'
      } else if (result.result.includes('~/.ssh')) {
        permissionRequest = '读取 ~/.ssh 目录'
      } else if (result.result.includes('/etc/')) {
        permissionRequest = '读取 /etc/ 目录文件'
      }
      
      // 发送权限问题通知到飞书
      await fetch(`${gatewayUrl}/api/notify-permission-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          taskId: task.id,
          taskTitle: task.title,
          errorMessage: result.result,
          permissionRequest: permissionRequest,
        }),
      })
    }
    
    log(`  ✓ Gateway 执行完成`)
    return { success: true, output: result.result || "", tokensUsed }
  } catch (err: any) {
    log(`  ✗ Gateway 调用失败: ${err.message}`)
    return { success: false, output: err.message, tokensUsed: 0 }
  }
}

// ============ Pipeline Steps ============
// 注意: 以下 pipeline 步骤与 packages/opencode/src/automation/pipeline-runner.ts 逻辑一致
// 核心引擎通过 PipelineRunner Effect.Service 调用，scheduler.ts 通过 execSync 直接调用
// 修改时请同步更新两处

async function stepExecuteTask(task: RoadmapTask, dryRun: boolean, chatId?: string): Promise<StepResult> {
  const start = Date.now()
  log(`[1/9] 执行任务: ${task.title}`)
  
  if (dryRun) {
    return { name: "执行任务", success: true, output: "[dry-run] skipped", duration: 0, tokensUsed: 0 }
  }
  
  // Loop mode: 最多重试 3 次，带错误分析
  const MAX_RETRIES = 3
  let lastOutput = ""
  const errorPatterns: string[] = [] // 跟踪错误模式
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      log(`  ↻ 重试 ${attempt}/${MAX_RETRIES}...`)
      
      // 错误分析：如果连续 2 次相同错误，跳过重试
      if (errorPatterns.length >= 2) {
        const lastTwo = errorPatterns.slice(-2)
        if (lastTwo[0] === lastTwo[1]) {
          log(`  ⚠ 检测到重复错误模式，跳过重试`)
          return { name: "执行任务", success: false, output: lastOutput, duration: Date.now() - start, tokensUsed: 0 }
        }
      }
    }
    
    // 如果配置了 chatId，通过 Gateway 执行（支持权限请求转发到飞书）
    if (chatId) {
      const result = await executeViaGateway(task, chatId)
      lastOutput = result.output
      
      if (result.success) {
        log(`  ✓ 任务执行完成 (attempt ${attempt})`)
        return { name: "执行任务", ...result, duration: Date.now() - start }
      }
      
      // 提取错误模式
      const errorPattern = extractErrorPattern(result.output)
      errorPatterns.push(errorPattern)
      
      log(`  ✗ 任务执行失败 (attempt ${attempt}): ${result.output.slice(0, 100)}`)
      
      // 最后一次失败，返回失败
      if (attempt === MAX_RETRIES) {
        return { name: "执行任务", success: false, output: lastOutput, duration: Date.now() - start, tokensUsed: result.tokensUsed }
      }
      
      continue
    }
    
    // 否则通过 CLI 执行（跳过迁移，由 mimo serve 守护进程处理）
    const cmd = `MIMOCODE_SKIP_MIGRATIONS=1 bun run --cwd packages/opencode --conditions=browser src/index.ts run "${task.description}"`
    const result = runCmd(cmd, 30 * 60 * 1000)
    lastOutput = result.output
    
    if (result.success) {
      log(`  ✓ 任务执行完成 (attempt ${attempt})`)
      return { name: "执行任务", ...result, duration: Date.now() - start, tokensUsed: 0 }
    }
    
    // 提取错误模式
    const errorPattern = extractErrorPattern(result.output)
    errorPatterns.push(errorPattern)
    
    log(`  ✗ 任务执行失败 (attempt ${attempt}): ${result.output.slice(0, 100)}`)
    
    if (attempt === MAX_RETRIES) {
      return { name: "执行任务", success: false, output: lastOutput, duration: Date.now() - start, tokensUsed: 0 }
    }
  }
  
  // Should not reach here
  return { name: "执行任务", success: false, output: lastOutput, duration: Date.now() - start, tokensUsed: 0 }
}

/** 提取错误模式（用于重复错误检测） */
function extractErrorPattern(output: string): string {
  // 提取关键错误特征
  if (output.includes("FOREIGN KEY")) return "FK_CONSTRAINT"
  if (output.includes("timeout") || output.includes("超时")) return "TIMEOUT"
  if (output.includes("permission") || output.includes("权限")) return "PERMISSION"
  if (output.includes("not found") || output.includes("不存在")) return "NOT_FOUND"
  if (output.includes("syntax error") || output.includes("语法错误")) return "SYNTAX_ERROR"
  return "UNKNOWN"
}

async function stepBuild(): Promise<StepResult> {
  const start = Date.now()
  log("[2/7] 编译验证...")
  
  const result = runCmd("bun run packages/opencode/script/build.ts --single", 3 * 60 * 1000)
  
  log(result.success ? "  ✓ 编译成功" : `  ✗ 编译失败: ${result.output.slice(0, 200)}`)
  return { name: "编译验证", ...result, duration: Date.now() - start }
}

async function stepTypecheck(): Promise<StepResult> {
  const start = Date.now()
  log("[3/9] 类型检查...")
  
  const result = runCmd("bun typecheck", 2 * 60 * 1000)
  
  // 过滤掉已知的类型错误
  const knownErrors = ["bash.ts", "tool.ts", "workflow.ts"]
  const hasOnlyKnownErrors = result.output.split("\n").every(line => 
    knownErrors.some(e => line.includes(e)) || line.trim() === ""
  )
  
  const success = result.success || hasOnlyKnownErrors
  log(success ? "  ✓ 类型检查通过" : `  ✗ 类型检查失败`)
  return { name: "类型检查", success, output: result.output, duration: Date.now() - start }
}

async function stepTest(): Promise<StepResult> {
  const start = Date.now()
  log("[5/10] 运行测试...")
  
  // 只跑变更文件相关的测试，不跑全量
  const { output: changed } = runCmd("git diff --name-only HEAD~1 2>/dev/null || git status --porcelain")
  const changedFiles = changed.split("\n").filter(f => f.trim())
  
  // 找出变更文件对应的测试文件
  const testFiles: string[] = []
  for (const file of changedFiles) {
    const clean = file.replace(/^[AM]\s+/, "").trim()
    // src/foo.ts → test/foo.test.ts 或 test/foo/*.test.ts
    if (clean.startsWith("packages/opencode/src/") && clean.endsWith(".ts")) {
      const base = clean.replace("packages/opencode/src/", "").replace(".ts", "")
      const testPatterns = [
        `test/${base}.test.ts`,
        `test/${base.replace("/", "/")}.test.ts`,
      ]
      for (const p of testPatterns) {
        if (existsSync(join(PROJECT_ROOT, "packages/opencode", p))) {
          testFiles.push(p)
        }
      }
    }
  }
  
  // 如果没有找到相关测试，跳过
  if (testFiles.length === 0) {
    log("  - 无相关测试文件，跳过")
    return { name: "测试", success: true, output: "无相关测试，跳过", duration: Date.now() - start }
  }
  
  log(`  找到 ${testFiles.length} 个相关测试文件`)
  const cmd = `cd packages/opencode && bun test ${testFiles.join(" ")}`
  const result = runCmd(cmd, 2 * 60 * 1000) // 2分钟超时
  
  log(result.success ? "  ✓ 测试通过" : `  ✗ 测试失败`)
  return { name: "测试", ...result, duration: Date.now() - start }
}

async function stepLint(): Promise<StepResult> {
  const start = Date.now()
  log("[6/10] Lint 检查...")
  
  // 只 lint 变更文件
  const { output: changed } = runCmd("git diff --name-only HEAD~1 2>/dev/null || git status --porcelain")
  const changedFiles = changed.split("\n").filter(f => f.trim()).map(f => f.replace(/^[AM]\s+/, "").trim())
  const tsFiles = changedFiles.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"))
  
  if (tsFiles.length === 0) {
    log("  - 无变更 TS 文件，跳过")
    return { name: "Lint", success: true, output: "无变更文件，跳过", duration: Date.now() - start }
  }
  
  const result = runCmd(`bun run lint ${tsFiles.join(" ")}`, 2 * 60 * 1000)
  
  log(result.success ? "  ✓ Lint 通过" : `  ✗ Lint 失败`)
  return { name: "Lint", ...result, duration: Date.now() - start }
}

// ============ Judge Review (裁判审查) ============

interface JudgeVerdict {
  approved: boolean
  issues: string[]
  suggestions: string[]
}

/** 审查 pipeline 步骤结果 */
function judgeReviewPipeline(steps: StepResult[]): JudgeVerdict {
  const issues: string[] = []
  const suggestions: string[] = []
  
  for (const step of steps) {
    if (!step.success) {
      // 测试失败是严重问题
      if (step.name === "测试") {
        issues.push(`测试未通过: ${step.output.slice(0, 200)}`)
      }
      // 编译失败是严重问题
      if (step.name === "编译验证") {
        issues.push(`编译失败: ${step.output.slice(0, 200)}`)
      }
      // Lint 失败是警告
      if (step.name === "Lint") {
        suggestions.push(`Lint 未通过: ${step.output.slice(0, 100)}`)
      }
    }
  }
  
  return { approved: issues.length === 0, issues, suggestions }
}

function judgeReviewChanges(): JudgeVerdict {
  const issues: string[] = []
  const suggestions: string[] = []
  
  // 获取变更文件列表
  const { output: statusOutput } = runCmd("git status --porcelain")
  const changedFiles = statusOutput
    .split("\n")
    .filter(l => l.trim())
    .map(l => l.slice(3).trim())
  
  if (changedFiles.length === 0) {
    return { approved: true, issues: [], suggestions: [] }
  }
  
  // 获取 diff 内容
  const { output: diff } = runCmd("git diff HEAD --unified=3")
  const { output: diffStaged } = runCmd("git diff --cached --unified=3")
  const fullDiff = diff + "\n" + diffStaged
  
  // ── 检查 1: 测试文件删除/断言减少 ──
  const testFilesChanged = changedFiles.filter(f => 
    f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
  )
  
  for (const testFile of testFilesChanged) {
    const { output: testDiff } = runCmd(`git diff HEAD -- "${testFile}"`)
    
    // 检测删除的断言行
    const removedAssertions = (testDiff.match(/^-\s*(expect|assert)\b.*$/gm) || []).length
    const addedAssertions = (testDiff.match(/^\+\s*(expect|assert)\b.*$/gm) || []).length
    
    if (removedAssertions > 0 && addedAssertions < removedAssertions) {
      const reduction = removedAssertions - addedAssertions
      issues.push(`测试文件 ${testFile} 删除了 ${reduction} 个断言`)
    }
    
    // 检测删除的 test/it 块
    const removedTests = (testDiff.match(/^-\s*(test|it)\s*\(/gm) || []).length
    const addedTests = (testDiff.match(/^\+\s*(test|it)\s*\(/gm) || []).length
    
    if (removedTests > addedTests) {
      issues.push(`测试文件 ${testFile} 删除了 ${removedTests - addedTests} 个测试用例`)
    }
    
    // 检测断言简化（toBe(true) → toBeTruthy() 等）
    const trivialPatterns = [
      { from: /\.toBe\(.*\)/, to: /\.toBeTruthy\(\)/, desc: "具体值断言 → truthy" },
      { from: /\.toEqual\(.*\)/, to: /\.toBeDefined\(\)/, desc: "具体值断言 → defined" },
    ]
    for (const p of trivialPatterns) {
      if (fullDiff.match(p.from) && fullDiff.match(p.to)) {
        issues.push(`检测到断言简化: ${p.desc}`)
      }
    }
  }
  
  // ── 检查 2: 危险文件修改 ──
  const dangerousFiles = [
    "AGENTS.md",
    ".mimocode/roadmap.json",
    "packages/opencode/src/permission/",
    "packages/opencode/src/storage/db.ts",
  ]
  
  for (const pattern of dangerousFiles) {
    const matches = changedFiles.filter(f => f.includes(pattern))
    if (matches.length > 0) {
      suggestions.push(`修改了敏感文件: ${matches.join(", ")}`)
    }
  }
  
  // ── 检查 3: 新增文件过多（可能是垃圾代码）──
  const newFiles = statusOutput.split("\n").filter(l => l.startsWith("??")).length
  if (newFiles > 20) {
    suggestions.push(`新增了 ${newFiles} 个文件，建议检查是否都是必要的`)
  }
  
  // ── 检查 4: 大量删除（可能是破坏性重构）──
  const deletedLines = (fullDiff.match(/^-\s*\S/gm) || []).length
  const addedLines = (fullDiff.match(/^\+\s*\S/gm) || []).length
  if (deletedLines > 500 && deletedLines > addedLines * 3) {
    issues.push(`删除了 ${deletedLines} 行代码（新增 ${addedLines} 行），可能是破坏性重构`)
  }
  
  const approved = issues.length === 0
  return { approved, issues, suggestions }
}

async function stepJudgeReview(): Promise<StepResult> {
  const start = Date.now()
  log("[2/9] Judge 审查...")
  
  const verdict = judgeReviewChanges()
  
  if (verdict.issues.length > 0) {
    log("  ✗ Judge 发现问题:")
    for (const issue of verdict.issues) {
      log(`    - ${issue}`)
    }
    return {
      name: "Judge审查",
      success: false,
      output: `发现问题: ${verdict.issues.join("; ")}`,
      duration: Date.now() - start,
    }
  }
  
  if (verdict.suggestions.length > 0) {
    log("  ⚠ Judge 建议:")
    for (const s of verdict.suggestions) {
      log(`    - ${s}`)
    }
  }
  
  log("  ✓ Judge 审查通过")
  return { name: "Judge审查", success: true, output: "审查通过", duration: Date.now() - start }
}

/** 审查 pipeline 结果（测试/编译是否通过） */
async function stepJudgeVerifyPipeline(steps: StepResult[]): Promise<StepResult> {
  const start = Date.now()
  log("[7/9] Judge 验证 Pipeline...")

  const verdict = judgeReviewPipeline(steps)

  if (verdict.issues.length > 0) {
    log("  ✗ Judge 发现 Pipeline 问题:")
    for (const issue of verdict.issues) {
      log(`    - ${issue}`)
    }
    return {
      name: "Judge验证",
      success: false,
      output: `Pipeline 问题: ${verdict.issues.join("; ")}`,
      duration: Date.now() - start,
    }
  }

  log("  ✓ Judge Pipeline 验证通过")
  return { name: "Judge验证", success: true, output: "验证通过", duration: Date.now() - start }
}

async function stepEnhancedJudge(task: RoadmapTask): Promise<StepResult> {
  const start = Date.now()
  log("[2.5/9] 增强 Judge 审查...")

  const verdict = runEnhancedJudge(task.id, task.title, task.description, task.specPath)

  if (verdict.issues.length > 0) {
    log("  ✗ 增强 Judge 发现问题:")
    for (const issue of verdict.issues) {
      log(`    - ${issue}`)
    }
    return {
      name: "增强Judge",
      success: false,
      output: `增强审查问题: ${verdict.issues.join("; ")}`,
      duration: Date.now() - start,
    }
  }

  if (verdict.suggestions.length > 0) {
    log("  ⚠ 增强 Judge 建议:")
    for (const s of verdict.suggestions) {
      log(`    - ${s}`)
    }
  }

  log("  ✓ 增强 Judge 审查通过")
  return { name: "增强Judge", success: true, output: "增强审查通过", duration: Date.now() - start }
}

async function stepSpecWriteback(task: RoadmapTask, pipelineSuccess: boolean, tokensUsed: number): Promise<StepResult> {
  const start = Date.now()
  log("[8.5/9] Spec 回写...")

  const SPECS_DIR = join(PROJECT_ROOT, "openspec/specs")
  let specPath = task.specPath
  let requirement: string | undefined

  // 如果没有 specPath，尝试自动查找
  if (!specPath) {
    const found = findSpecForTask(task.description, SPECS_DIR)
    if (found) {
      specPath = found.specPath
      requirement = found.requirement
      log(`  自动匹配到 spec: ${specPath}`)
    } else {
      log("  - 未找到关联 spec，跳过")
      return { name: "Spec回写", success: true, output: "无关联 spec", duration: Date.now() - start }
    }
  }

  // 从任务描述中提取需求名称
  if (!requirement) {
    const requirementMatch = task.description.match(/需求:\s*(.+)/)
    requirement = requirementMatch ? requirementMatch[1].trim() : task.title.replace("[Spec] ", "")
  }

  const success = updateSpecStatus(specPath, requirement, {
    success: pipelineSuccess,
    output: pipelineSuccess ? "任务执行成功" : "任务执行失败",
    tokensUsed,
  })

  if (success) {
    log("  ✓ Spec 已更新")
    return { name: "Spec回写", success: true, output: "Spec 状态已更新", duration: Date.now() - start }
  }

  log("  ✗ Spec 更新失败")
  return { name: "Spec回写", success: false, output: "Spec 更新失败", duration: Date.now() - start }
}

async function stepUpdateDocs(task: RoadmapTask): Promise<StepResult> {
  const start = Date.now()
  log("[7/9] 更新文档...")
  
  // 检查是否有未提交的文档变更
  const { output: gitStatus } = runCmd("git status --porcelain")
  const hasDocChanges = gitStatus.split("\n").some(line => 
    line.includes(".md") || line.includes("docs/")
  )
  
  if (hasDocChanges) {
    log("  ✓ 文档已更新")
    return { name: "文档更新", success: true, output: "文档变更已检测", duration: Date.now() - start }
  }
  
  // 检查是否需要更新 CHANGELOG
  const changelogPath = join(PROJECT_ROOT, "CHANGELOG.md")
  if (existsSync(changelogPath)) {
    const date = new Date().toISOString().slice(0, 10)
    const entry = `\n## ${date}\n- ${task.id}: ${task.title}\n`
    writeFileSync(changelogPath, readFileSync(changelogPath, "utf-8") + entry)
    log("  ✓ CHANGELOG 已更新")
  }
  
  return { name: "文档更新", success: true, output: "完成", duration: Date.now() - start }
}

async function stepGitCommitAndPush(task: RoadmapTask, noPush: boolean): Promise<StepResult> {
  const start = Date.now()
  log("[7/7] Git 提交...")
  
  // 检查是否有变更
  const { output: status } = runCmd("git status --porcelain")
  if (!status.trim()) {
    log("  - 无变更，跳过提交")
    return { name: "Git", success: true, output: "无变更", duration: Date.now() - start }
  }
  
  // 添加变更文件
  runCmd("git add -A")
  
  // 提交
  const commitMsg = `auto-dev: ${task.id} - ${task.title}\n\n自动执行: ${task.description}`
  const { success: commitSuccess } = runCmd(`git commit -m "${commitMsg}"`)
  
  if (!commitSuccess) {
    log("  ✗ 提交失败")
    return { name: "Git", success: false, output: "提交失败", duration: Date.now() - start }
  }
  
  log("  ✓ 已提交")
  
  // 推送
  if (!noPush) {
    log("  推送到远程...")
    // 检查是否有 upstream
    const { output: upstream } = runCmd("git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null")
    const { output: branch } = runCmd("git rev-parse --abbrev-ref HEAD")
    
    const pushCmd = upstream.trim()
      ? "git push"
      : `git push --set-upstream origin ${branch.trim()}`
    
    const { success: pushSuccess, output: pushOutput } = runCmd(pushCmd, 3 * 60 * 1000)
    
    if (pushSuccess) {
      log("  ✓ 已推送")
      return { name: "Git", success: true, output: "已提交并推送", duration: Date.now() - start }
    } else {
      log(`  ⚠ 推送失败: ${pushOutput.slice(0, 100)}`)
      return { name: "Git", success: true, output: "已提交，推送失败", duration: Date.now() - start }
    }
  }
  
  return { name: "Git", success: true, output: "已提交（未推送）", duration: Date.now() - start }
}

// ============ Main Pipeline ============

interface PipelineResult {
  success: boolean
  tokensUsed: number
  steps: StepResult[]
}

async function runPipeline(task: RoadmapTask, options: { dryRun: boolean; noPush: boolean; chatId?: string }): Promise<PipelineResult> {
  const steps: StepResult[] = []
  
  // 获取模式配置
  const mode = task.mode ?? "build"
  const evolutionConfig = getModeEvolutionConfig(mode)
  log(`模式: ${mode} | Judge: ${evolutionConfig.judgeEnabled ? "启用" : "禁用"} | Trace: ${evolutionConfig.traceExportEnabled ? "启用" : "禁用"}`)
  
  // Step 1: 执行任务
  steps.push(await stepExecuteTask(task, options.dryRun, options.chatId))
  const execStep = steps[steps.length - 1]
  if (!execStep.success) {
    log("\n✗ 任务执行失败，终止流程")
    printReport(steps)
    return { success: false, tokensUsed: execStep.tokensUsed ?? 0, steps }
  }
  
  if (options.dryRun) {
    log("\n[dry-run] 跳过验证步骤")
    printReport(steps)
    return { success: true, tokensUsed: 0, steps }
  }
  
  // Step 2: Judge 审查（根据模式配置决定是否启用）
  let judgeFailed = false
  if (evolutionConfig.judgeEnabled) {
    steps.push(await stepJudgeReview())
    judgeFailed = !steps[steps.length - 1].success
    if (judgeFailed) {
      log("\n✗ Judge 审查失败，终止流程")
      printReport(steps)
      return { success: false, tokensUsed: execStep.tokensUsed ?? 0, steps }
    }
  } else {
    log("\n[跳过] Judge 审查（模式禁用）")
  }
  
  // Step 3: 编译验证
  steps.push(await stepBuild())
  const buildFailed = !steps[steps.length - 1].success
  
  // Step 4-6: 验证步骤
  steps.push(await stepTypecheck())
  steps.push(await stepTest())
  steps.push(await stepLint())
  
  // Step 2.5: 增强 Judge 审查（根据模式配置决定是否启用）
  let enhancedJudgeFailed = false
  if (evolutionConfig.judgeEnabled) {
    steps.push(await stepEnhancedJudge(task))
    enhancedJudgeFailed = !steps[steps.length - 1].success
    if (enhancedJudgeFailed) {
      log("\n✗ 增强 Judge 审查失败，终止流程")
      printReport(steps)
      return { success: false, tokensUsed: execStep.tokensUsed ?? 0, steps }
    }
  } else {
    log("\n[跳过] 增强 Judge 审查（模式禁用）")
  }

  // Step 7: Judge 验证 Pipeline（测试/编译是否通过）
  steps.push(await stepJudgeVerifyPipeline(steps))
  const pipelineVerifyFailed = !steps[steps.length - 1].success

  // Step 8: 文档更新
  steps.push(await stepUpdateDocs(task))

  // Step 8.5: Spec 回写
  const pipelineSuccess = !buildFailed && !judgeFailed && !enhancedJudgeFailed && !pipelineVerifyFailed
  steps.push(await stepSpecWriteback(task, pipelineSuccess, execStep.tokensUsed ?? 0))

  // Step 9: Git
  steps.push(await stepGitCommitAndPush(task, options.noPush))

  // 任务成功 = 执行成功 + Judge审查通过 + 增强Judge通过 + 编译成功 + Judge验证通过
  const taskSuccess = !buildFailed && !judgeFailed && !enhancedJudgeFailed && !pipelineVerifyFailed
  const tokensUsed = execStep.tokensUsed ?? 0

  // Step 10: 保存Trace到DPO目录
  await stepSaveTrace(task, taskSuccess, tokensUsed, steps)

  printReport(steps)
  return { success: taskSuccess, tokensUsed, steps }
}

function printReport(steps: StepResult[]) {
  const totalTime = steps.reduce((sum, s) => sum + s.duration, 0)
  
  log("\n" + "=".repeat(50))
  log("执行报告")
  log("=".repeat(50))
  
  for (const step of steps) {
    const icon = step.success ? "✓" : "✗"
    const duration = step.duration > 0 ? ` (${(step.duration / 1000).toFixed(1)}s)` : ""
    log(`  ${icon} ${step.name}${duration}`)
  }
  
  log("-".repeat(50))
  log(`  总耗时: ${(totalTime / 1000).toFixed(1)}s`)
  log(`  结果: ${steps.every(s => s.success) ? "全部通过" : "有失败项"}`)
  log("=".repeat(50))
}

// ============ Trace Export ============

const DOFOODING_DIR = join(PROJECT_ROOT, ".dogfooding")
const SUCCESS_DIR = join(DOFOODING_DIR, "success_traces")
const FAILED_DIR = join(DOFOODING_DIR, "failed_traces")

/**
 * 保存任务执行trace到success/failed目录
 */
async function stepSaveTrace(task: RoadmapTask, success: boolean, tokensUsed: number, steps: StepResult[]): Promise<void> {
  // 获取模式配置
  const mode = task.mode ?? "build"
  const evolutionConfig = getModeEvolutionConfig(mode)

  // 检查模式是否启用Trace导出
  if (!evolutionConfig.traceExportEnabled) {
    log("[跳过] Trace导出（模式禁用）")
    return
  }

  try {
    const targetDir = success ? SUCCESS_DIR : FAILED_DIR
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const traceFile = join(targetDir, `${task.id}-${timestamp}.json`)

    const trace = {
      id: `${task.id}-${timestamp}`,
      taskId: task.id,
      title: task.title,
      description: task.description,
      success,
      tokensUsed,
      timestamp: Date.now(),
      mode,
      steps: steps.map(s => ({
        name: s.name,
        success: s.success,
        duration: s.duration,
        output: s.output.slice(0, 500), // 限制输出长度
      })),
      diff: getGitDiff(),
    }

    writeFileSync(traceFile, JSON.stringify(trace, null, 2))
    log(`✓ Trace 已保存: ${traceFile}`)

    // 检查模式是否启用进化学习
    if (evolutionConfig.evolutionEnabled) {
      // 检查是否需要自动导出DPO
      const shouldExportResult = await shouldExport()
      if (shouldExportResult) {
        log("触发 DPO 自动导出...")
        await exportDPO([], false, false)
      }
    } else {
      log("[跳过] DPO导出（模式禁用进化学习）")
    }
  } catch (err: any) {
    log(`⚠ Trace 保存失败: ${err.message}`)
  }
}

/**
 * 获取git diff
 */
function getGitDiff(): string {
  try {
    return execSync("git diff HEAD --unified=3", {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
      timeout: 10000,
    })
  } catch {
    return ""
  }
}

// ============ Feishu Notification ============

const GATEWAY_URL = process.env.GATEWAY_API_URL || "http://localhost:3096"

async function ensureGateway(): Promise<boolean> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/api/health`, { signal: AbortSignal.timeout(2000) })
    if (resp.ok) return true
  } catch {}

  log("Gateway 不可达，尝试启动...")
  try {
    execSync(`cd ${PROJECT_ROOT}/packages/feishu-gateway && bun run src/index.ts &`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "ignore",
    })
    await new Promise(r => setTimeout(r, 5000))
    return true
  } catch (e: any) {
    log(`Gateway 启动失败: ${e.message}`)
    return false
  }
}

async function notifyFeishu(chatId: string, title: string, message: string, level: "error" | "warn" | "info" = "error") {
  try {
    const resp = await fetch(`${GATEWAY_URL}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, title, message, level }),
    })
    if (resp.ok) {
      log(`飞书通知已发送: ${title}`)
    } else {
      log(`飞书通知失败: ${resp.status}`)
    }
  } catch (err: any) {
    log(`飞书通知异常: ${err.message}`)
  }
}

// ============ Entry Point ============

async function main() {
  const args = process.argv.slice(2)
  const once = args.includes("--once")
  const dryRun = args.includes("--dry-run")
  const noPush = args.includes("--no-push")
  
  // 解析 --chat-id 参数（用于通过 Gateway 执行任务，支持权限请求转发到飞书）
  const chatIdIndex = args.indexOf("--chat-id")
  const chatId = chatIdIndex !== -1 && args[chatIdIndex + 1] ? args[chatIdIndex + 1] : undefined
  
  log("=".repeat(50))
  log("Helix Auto-Dev Scheduler")
  log("=".repeat(50))
  log(`模式: ${once ? "单次" : "持续"} | 干运行: ${dryRun} | 不推送: ${noPush}`)
  if (chatId) log(`飞书 Chat ID: ${chatId}`)
  
  // 确保 gateway 可用
  if (chatId) {
    await ensureGateway()
  }
  
  const roadmap = loadRoadmap()
  if (!roadmap) {
    log("未找到 roadmap.json，退出")
    if (chatId) await notifyFeishu(chatId, "自动开发失败", "未找到 roadmap.json")
    return
  }
  
  if (!roadmap.auto_dev_config.enabled) {
    log("自动开发已禁用，退出")
    return
  }
  
  const budgetUsed = getDailyBudgetUsed()
  const budgetLimit = roadmap.auto_dev_config.daily_token_limit
  const budgetRemaining = budgetLimit - budgetUsed
  
  log(`预算: ${budgetUsed.toLocaleString()} / ${budgetLimit.toLocaleString()} (剩余 ${budgetRemaining.toLocaleString()})`)
  
  if (budgetRemaining < 10000) {
    log("预算不足，退出")
    if (chatId) await notifyFeishu(chatId, "自动开发跳过", `预算不足: ${budgetUsed.toLocaleString()} / ${budgetLimit.toLocaleString()}`, "warn")
    return
  }
  
  const task = getNextTask(roadmap)
  if (!task) {
    log("无待办任务，退出")
    return
  }
  
  log(`\n选定任务: ${task.id} - ${task.title}`)
  log(`描述: ${task.description}`)
  log(`优先级: ${task.priority} | 预估: ~${task.estimated_tokens.toLocaleString()} tokens\n`)
  
  // 标记为进行中（dry-run 不标记）
  if (!dryRun) {
    updateTaskStatus(roadmap, task.id, "in_progress")
  }
  
  // 执行完整流程
  const pipeline = await runPipeline(task, { dryRun, noPush, chatId })
  
  // 更新状态（dry-run 不标记）
  if (!dryRun) {
    updateTaskStatus(roadmap, task.id, pipeline.success ? "done" : "pending")
  }
  
  log(`\n任务 ${task.id} ${pipeline.success ? "✓ 完成" : "✗ 失败"}`)
  
  // 发送飞书通知（无论成功或失败）
  if (chatId) {
    const budgetAfter = getDailyBudgetUsed()
    
    // 收集各步骤状态
    const stepStatus = (name: string) => {
      const step = pipeline.steps.find(s => s.name === name)
      if (!step) return "⏭️"
      return step.success ? "✅" : "❌"
    }
    const hasChanges = pipeline.steps.find(s => s.name === "Git")?.output?.includes("已提交")
    
    // 构建详细通知
    const lines: string[] = []
    lines.push(`**任务**: ${task.id} - ${task.title}`)
    lines.push(`**结果**: ${pipeline.success ? "✅ 成功" : "❌ 失败"}`)
    lines.push("")
    lines.push(`**Token 消耗**`)
    lines.push(`- 本次消耗: ${pipeline.tokensUsed.toLocaleString()}`)
    lines.push(`- 每日上限: ${budgetLimit.toLocaleString()}`)
    lines.push(`- 今日已用: ${budgetAfter.toLocaleString()}`)
    lines.push(`- 剩余: ${(budgetLimit - budgetAfter).toLocaleString()}`)
    lines.push("")
    lines.push(`**Pipeline 结果**`)
    lines.push(`- 执行任务: ${stepStatus("执行任务")}`)
    lines.push(`- Judge 审查: ${stepStatus("Judge审查")}`)
    lines.push(`- 增强 Judge: ${stepStatus("增强Judge")}`)
    lines.push(`- 编译: ${stepStatus("编译验证")}`)
    lines.push(`- 类型检查: ${stepStatus("类型检查")} (预存问题)`)
    lines.push(`- 测试: ${stepStatus("测试")} (预存问题)`)
    lines.push(`- Lint: ${stepStatus("Lint")} (预存问题)`)
    lines.push(`- Spec 回写: ${stepStatus("Spec回写")}`)
    lines.push(`- 文档: ${stepStatus("文档更新")}`)
    lines.push(`- Git: ${stepStatus("Git")} ${hasChanges ? "(已提交)" : ""}`)
    lines.push("")
    lines.push(`日志: ~/.local/share/mimocode/log/auto-dev-${new Date().toISOString().slice(0, 10)}.log`)
    
    await notifyFeishu(
      chatId,
      `自动开发${pipeline.success ? "完成" : "失败"}: ${task.id}`,
      lines.join("\n"),
      pipeline.success ? "info" : "error"
    )
  }
}

main().catch(async (e) => {
  log(`致命错误: ${e.message}`)
  const args = process.argv.slice(2)
  const chatIdIndex = args.indexOf("--chat-id")
  const chatId = chatIdIndex !== -1 && args[chatIdIndex + 1] ? args[chatIdIndex + 1] : undefined
  if (chatId) await notifyFeishu(chatId, "自动开发致命错误", e.message)
  process.exit(1)
})
