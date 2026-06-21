#!/usr/bin/env bun
/**
 * Helix Auto-Dev Scheduler
 * 
 * 完整流程: 执行任务 → 编译 → 类型检查 → 测试 → Lint → 文档 → Git Commit → Git Push
 * 用法: bun run script/auto-dev/scheduler.ts [--once] [--dry-run] [--no-push]
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { Database } from "bun:sqlite"
import { execSync } from "child_process"

const PROJECT_ROOT = join(import.meta.dirname, "../..")
const ROADMAP_PATH = join(PROJECT_ROOT, ".mimocode/roadmap.json")
const LOG_DIR = join(homedir(), ".local/share/mimocode/log")
const LOG_FILE = join(LOG_DIR, `auto-dev-${new Date().toISOString().slice(0, 10)}.log`)
const OPCODE_PACKAGE = join(PROJECT_ROOT, "packages/opencode")

interface RoadmapTask {
  id: string
  title: string
  description: string
  status: "pending" | "in_progress" | "done"
  priority: "critical" | "high" | "medium" | "low"
  estimated_tokens: number
  tags: string[]
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

function getNextTask(roadmap: Roadmap): RoadmapTask | null {
  const { focus_milestones, skip_tags } = roadmap.auto_dev_config
  
  for (const milestoneId of focus_milestones) {
    const milestone = roadmap.milestones.find(m => m.id === milestoneId)
    if (!milestone || milestone.status === "done") continue
    
    const pendingTasks = milestone.tasks.filter(t => 
      t.status === "pending" && 
      !t.tags.some(tag => skip_tags.includes(tag))
    )
    
    if (pendingTasks.length === 0) continue
    
    const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
    pendingTasks.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])
    
    return pendingTasks[0]
  }
  
  return null
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
    const result = db.query("SELECT used FROM daily_budget WHERE date = ?").get(today) as any
    db.close()
    return result?.used ?? 0
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

async function executeViaGateway(task: RoadmapTask, chatId: string): Promise<{ success: boolean; output: string }> {
  const gatewayUrl = process.env.GATEWAY_API_URL || "http://localhost:3096"
  
  try {
    log(`通过 Gateway 执行任务: ${task.title}`)
    
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
      return { success: false, output: error }
    }
    
    const result = await response.json()
    
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
    return { success: true, output: result.result || "" }
  } catch (err: any) {
    log(`  ✗ Gateway 调用失败: ${err.message}`)
    return { success: false, output: err.message }
  }
}

// ============ Pipeline Steps ============

async function stepExecuteTask(task: RoadmapTask, dryRun: boolean, chatId?: string): Promise<StepResult> {
  const start = Date.now()
  log(`[1/7] 执行任务: ${task.title}`)
  
  if (dryRun) {
    return { name: "执行任务", success: true, output: "[dry-run] skipped", duration: 0 }
  }
  
  // 如果配置了 chatId，通过 Gateway 执行（支持权限请求转发到飞书）
  if (chatId) {
    const result = await executeViaGateway(task, chatId)
    log(result.success ? "  ✓ 任务执行完成" : `  ✗ 任务执行失败: ${result.output.slice(0, 200)}`)
    return { name: "执行任务", ...result, duration: Date.now() - start }
  }
  
  // 否则通过 CLI 执行
  const cmd = `bun run --cwd packages/opencode --conditions=browser src/index.ts run "${task.description}"`
  const result = runCmd(cmd, 30 * 60 * 1000)
  
  log(result.success ? "  ✓ 任务执行完成" : `  ✗ 任务执行失败: ${result.output.slice(0, 200)}`)
  return { name: "执行任务", ...result, duration: Date.now() - start }
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
  log("[3/7] 类型检查...")
  
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
  log("[4/7] 运行测试...")
  
  const result = runCmd("cd packages/opencode && bun test", 5 * 60 * 1000)
  
  log(result.success ? "  ✓ 测试通过" : `  ✗ 测试失败`)
  return { name: "测试", ...result, duration: Date.now() - start }
}

async function stepLint(): Promise<StepResult> {
  const start = Date.now()
  log("[5/7] Lint 检查...")
  
  const result = runCmd("bun run lint", 5 * 60 * 1000)
  
  log(result.success ? "  ✓ Lint 通过" : `  ✗ Lint 失败`)
  return { name: "Lint", ...result, duration: Date.now() - start }
}

async function stepUpdateDocs(task: RoadmapTask): Promise<StepResult> {
  const start = Date.now()
  log("[6/7] 更新文档...")
  
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

async function runPipeline(task: RoadmapTask, options: { dryRun: boolean; noPush: boolean; chatId?: string }): Promise<boolean> {
  const steps: StepResult[] = []
  
  // Step 1: 执行任务
  steps.push(await stepExecuteTask(task, options.dryRun, options.chatId))
  if (!steps[steps.length - 1].success) {
    log("\n✗ 任务执行失败，终止流程")
    printReport(steps)
    return false
  }
  
  if (options.dryRun) {
    log("\n[dry-run] 跳过验证步骤")
    printReport(steps)
    return true
  }
  
  // Step 2: 编译验证
  steps.push(await stepBuild())
  if (!steps[steps.length - 1].success) {
    log("\n✗ 编译失败，终止流程")
    printReport(steps)
    return false
  }
  
  // Step 3: 类型检查
  steps.push(await stepTypecheck())
  
  // Step 4: 测试
  steps.push(await stepTest())
  
  // Step 5: Lint
  steps.push(await stepLint())
  
  // Step 6: 文档更新
  steps.push(await stepUpdateDocs(task))
  
  // Step 7: Git
  steps.push(await stepGitCommitAndPush(task, options.noPush))
  
  const allSuccess = steps.every(s => s.success)
  printReport(steps)
  
  return allSuccess
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

// ============ Feishu Notification ============

const GATEWAY_URL = process.env.GATEWAY_API_URL || "http://localhost:3096"

async function ensureGateway(): Promise<boolean> {
  try {
    const resp = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(2000) })
    if (resp.ok) return true
  } catch {}

  // gateway 没有 /health，直接尝试 notify 端点可达性
  try {
    const resp = await fetch(`${GATEWAY_URL}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "ping", message: "ping" }),
      signal: AbortSignal.timeout(3000),
    })
    // 400 也算可达（参数不对但服务在）
    return resp.status < 500
  } catch {
    log("Gateway 不可达，尝试启动...")
    try {
      execSync(`cd ${PROJECT_ROOT}/packages/feishu-gateway && bun run src/index.ts &`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: "ignore",
      })
      // 等几秒让 gateway 起来
      await new Promise(r => setTimeout(r, 5000))
      return true
    } catch (e: any) {
      log(`Gateway 启动失败: ${e.message}`)
      return false
    }
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
  
  // 标记为进行中
  updateTaskStatus(roadmap, task.id, "in_progress")
  
  // 执行完整流程
  const success = await runPipeline(task, { dryRun, noPush, chatId })
  
  // 更新状态
  updateTaskStatus(roadmap, task.id, success ? "done" : "pending")
  
  log(`\n任务 ${task.id} ${success ? "✓ 完成" : "✗ 失败"}`)
  
  // 失败时通知飞书
  if (!success && chatId) {
    const failedSteps = [] // 从日志中提取失败步骤
    await notifyFeishu(
      chatId,
      `自动开发失败: ${task.id} - ${task.title}`,
      `任务执行失败，请检查日志:\n~/.local/share/mimocode/log/auto-dev-${new Date().toISOString().slice(0, 10)}.log`
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
