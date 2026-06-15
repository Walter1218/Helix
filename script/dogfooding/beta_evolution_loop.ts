#!/usr/bin/env bun
import { $, file } from "bun"
import path from "path"
import fs from "fs/promises"
import { spawn } from "node:child_process"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

// ============================================================================
// observerLog 过滤器：去掉编译后 JS 源码噪音，但保留错误信息和栈帧
// ============================================================================
const TUI_LINE = /^(\$|→|✱|⚠|⏱|📦|🚀|✅|❌|📊|▶|\x1b\[|"|[A-Z][a-z])/
const ERROR_LINE = /(error|Error|TypeError|ReferenceError|SyntaxError|EACCES|ENOENT|ECONNREFUSED|ETIMEDOUT|exit code|\bFAIL|✗|✘|fatal|uncaught|unhandled)/i
const STACK_LINE = /^\s+at\s/
const BUNFS_LINE = /^\$bunfs/

const NOISE_PATTERNS = [
  /^(var|const|let)\s.*=\s/,  // JS 变量赋值
  /\bfunction\s/,              // JS 函数定义 (用 \b 避免匹配 "functionality")
  /^class\s.*extends/,        // JS class 定义
  /^\d+ \| `/,                // 行号+代码片段
]

function sanitizeObserverLog(raw: string): string {
  const lines = raw.split("\n")
  const clean = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    // 永远保留错误和栈帧
    if (ERROR_LINE.test(trimmed)) return true
    if (STACK_LINE.test(line)) return true
    if (BUNFS_LINE.test(trimmed)) return true
    // 过滤噪音
    for (const p of NOISE_PATTERNS) {
      if (p.test(trimmed)) return false
    }
    return TUI_LINE.test(line.trimStart()) || trimmed.includes("=> ") || trimmed.includes("…")
  })
  if (clean.length < 3) return raw.slice(-500)
  return clean.join("\n")
}

// ============================================================================
// ProgressObserver — 智能进程守护者
// 不再是粗暴的倒计时 kill，而是像 Judge Agent 一样，通过观测子进程的
// 输出行为来判断是否"陷入死循环"或"已经卡死"，只在真正无用时才 kill。
// ============================================================================

/** 按任务复杂度分级的观测阈值 */
const OBSERVER_CONFIG: Record<string, { idleSec: number; maxLoopRepeat: number; hardTimeoutMin: number }> = {
  COMP: { idleSec: 240, maxLoopRepeat: 8, hardTimeoutMin: 30 },
  AST:  { idleSec: 180, maxLoopRepeat: 5, hardTimeoutMin: 15 },
  HEAL: { idleSec: 180, maxLoopRepeat: 5, hardTimeoutMin: 15 },
  ENV:  { idleSec: 120, maxLoopRepeat: 5, hardTimeoutMin: 10 },
  PLAN: { idleSec: 90,  maxLoopRepeat: 4, hardTimeoutMin: 5 },
  ROLL: { idleSec: 60,  maxLoopRepeat: 4, hardTimeoutMin: 5 },
}

const observerCfg = (category: string) => OBSERVER_CONFIG[category] ?? OBSERVER_CONFIG.AST!

type ObserverDecision = "idle" | "loop" | "hard_timeout" | "exit" | "error"

class ProgressObserver {
  private lastOutputAt = Date.now()
  private outputLineCount = 0
  private recentLines: string[] = []       // sliding window for loop detection
  private killed = false
  private decision: ObserverDecision = "exit"
  private accumulatedOutput = ""

  constructor(
    private category: string,
    private _onLog: (msg: string) => void,
  ) {}

  /** 每收到一行输出时调用，观测者据此判断是否有进展 */
  feedLine(line: string) {
    this.lastOutputAt = Date.now()
    this.outputLineCount++
    this.accumulatedOutput += line + "\n"

    // 回调给外部（实时打印到终端）
    try { this._onLog(line) } catch {}

    // 只保留最近 20 行做重复检测
    this.recentLines.push(line.trim())
    if (this.recentLines.length > 20) this.recentLines.shift()
  }

  /** 检测是否陷入输出重复的死循环 */
  detectLoop(): boolean {
    const cfg = observerCfg(this.category)
    if (this.recentLines.length < cfg.maxLoopRepeat) return false
    // 取最后 N 条，如果都完全相同 → 判定为重复循环
    const lastN = this.recentLines.slice(-cfg.maxLoopRepeat)
    const first = lastN[0]
    if (!first || first.length < 10) return false // 太短的行不算（比如单纯的空行或 "ok"）
    return lastN.every((l) => l === first)
  }

  /** 主检测入口：每次 feedLine 后调用，返回是否需要 kill */
  check(): { shouldKill: boolean; reason: string } | null {
    if (this.killed) return null

    const cfg = observerCfg(this.category)
    const elapsedSec = (Date.now() - this.lastOutputAt) / 1000

    // 1. 空闲检测：N 秒没有任何新输出 → 进程大概率卡死
    if (elapsedSec >= cfg.idleSec) {
      this.decision = "idle"
      this.killed = true
      return { shouldKill: true, reason: `idle ${elapsedSec.toFixed(0)}s (阈值 ${cfg.idleSec}s)` }
    }

    // 2. 死循环检测：最近 N 条输出完全一致 → 陷入重复操作
    if (this.detectLoop()) {
      this.decision = "loop"
      this.killed = true
      const lastLine = this.recentLines[this.recentLines.length - 1] ?? ""
      return { shouldKill: true, reason: `loop detected (重复输出: "${lastLine.slice(0, 80)}")` }
    }

    return null
  }

  /** 真正的硬超时——最后的兜底线，不会被空闲/循环重置 */
  hardTimeoutSec(): number {
    const cfg = observerCfg(this.category)
    return cfg.hardTimeoutMin * 60
  }

  markHardTimeout() { this.decision = "hard_timeout"; this.killed = true }
  getDecision() { return this.decision }
  getOutput() { return this.accumulatedOutput }
}

/**
 * 在观测者的守护下运行 CLI 子进程。
 * 使用 Node child_process.spawn 进行流式输出捕获，
 * ProgressObserver 实时分析输出，按需 kill。
 */
function runWithObserver(
  cmd: string,
  args: string[],
  cwd: string,
  observer: ProgressObserver,
): Promise<{ exitCode: number | null; killed: boolean; reason: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] })
    let killed = false
    let killReason = ""
    const hardTimeoutMs = observer.hardTimeoutSec() * 1000
    let hardTimer: Timer

    const onOutput = (chunk: Buffer) => {
      const lines = chunk.toString().split("\n")
      for (const line of lines) {
        if (!line) continue
        observer.feedLine(line)
        const check = observer.check()
        if (check?.shouldKill && !killed) {
          killed = true
          killReason = check.reason
          proc.kill("SIGKILL")
        }
      }
    }

    proc.stdout?.on("data", onOutput)
    proc.stderr?.on("data", onOutput)

    const onExit = (code: number | null) => {
      clearTimeout(hardTimer)
      resolve({ exitCode: code, killed, reason: killReason })
    }

    proc.on("close", onExit)
    proc.on("error", (err) => {
      clearTimeout(hardTimer)
      resolve({ exitCode: null, killed: true, reason: `spawn error: ${err.message}` })
    })

    // 硬超时兜底
    hardTimer = setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) {
        observer.markHardTimeout()
        proc.kill("SIGKILL")
        killed = true
        killReason = `hard timeout (${observer.hardTimeoutSec() / 60}min)`
      }
    }, hardTimeoutMs)
  })
}

async function runBetaEvolutionLoop() {
  console.log(`\n${BLUE}🚀 启动 Helix Beta 进化闭环 (Phase 1: 坚壁清野)...${RESET}`)
  
  const setupScript = path.resolve("script/dogfooding/setup.ts")
  const platform = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const cliScript = path.resolve(`packages/opencode/dist/mimocode-${platform}-${arch}/bin/mimo${process.platform === "win32" ? ".exe" : ""}`)
  
  if (!(await file(setupScript).exists()) || !(await file(cliScript).exists())) {
    console.error(`${RED}❌ 找不到环境脚手架或 CLI 脚本，请在 Helix 项目根目录执行。${RESET}`)
    process.exit(1)
  }

  const casesPath = path.resolve("script/dogfooding/cases.json")
  if (!(await file(casesPath).exists())) {
    console.error(`${RED}❌ 找不到 cases.json，请先执行 bun run script/dogfooding/generate_cases.ts${RESET}`)
    process.exit(1)
  }

  const allCasesContent = await file(casesPath).json()
  const allCases = Array.isArray(allCasesContent) ? allCasesContent : []
  
  console.log(`${YELLOW}==========================================${RESET}`)
  console.log(`${YELLOW}▶ 阶段 A: 清理与环境自愈 (WorktreeGC)${RESET}`)
  console.log(`${YELLOW}==========================================${RESET}`)
  console.log(`${BLUE}正在扫描并清除上一次运行遗留的孤儿工作区...${RESET}`)
  
  // 确保 Trace 持久化目录存在（供 export_dpo.ts 消费）
  const successDir = path.resolve(".dogfooding/success_traces")
  const failedDir = path.resolve(".dogfooding/failed_traces")
  await fs.mkdir(successDir, { recursive: true })
  await fs.mkdir(failedDir, { recursive: true })
  
  let passed = 0
  let dirtyTraces = 0

  for (const t of allCases) {
    console.log(`\n${YELLOW}==========================================${RESET}`)
    console.log(`${YELLOW}▶ 正在执行测试: ${t.id} - ${t.description}${RESET}`)
    console.log(`${YELLOW}==========================================${RESET}`)
    
    // 1. 准备沙箱环境
    await $`bun run ${setupScript} ${t.id}`.quiet()
    
    const targetDir = path.resolve(`./.dogfooding/${t.id.toLowerCase()}`)
    console.log(`${BLUE}正在唤起带 ToolInterceptor 拦截器的智能体...${RESET}`)
    
    const cfg = observerCfg(t.category)
    console.log(`${BLUE}👁 观测者已启动 | 类别: ${t.category} | 空闲阈值: ${cfg.idleSec}s | 死循环阈值: ${cfg.maxLoopRepeat}次 | 硬超时: ${cfg.hardTimeoutMin}min${RESET}`)

    const observer = new ProgressObserver(t.category, (msg) => {
      // 实时输出 Agent 的执行日志到终端
      process.stdout.write(`  ${msg}\n`)
    })

    try {
      // 2. 在 ProgressObserver 的守护下执行任务
      const result = await runWithObserver(
        cliScript,
        ["run", t.prompt, "--dangerously-skip-permissions"],
        targetDir,
        observer,
      )
      
      // 3. 观测者判定：空闲 / 死循环 / 硬超时 → 标记为脏数据
      if (result.killed) {
        const decisionMap: Record<string, string> = {
          idle: "空闲无输出",
          loop: "输出死循环",
          hard_timeout: "硬超时",
        }
        const reasonLabel = decisionMap[observer.getDecision()] ?? observer.getDecision()
        console.log(`${RED}⚠️ 观测者 kill (${reasonLabel}: ${result.reason}): 抛弃该用例产生的 Trace，不进入进化飞轮。${RESET}`)
        dirtyTraces++
        continue
      }

      // 4. 启发式网关判断：ExitCode 137 (OOM) 或 124 (Timeout)
      if (result.exitCode === 137 || result.exitCode === 124) {
        console.log(`${RED}⚠️ 检测到脏数据 (OOM/Timeout): 抛弃该用例产生的 Trace，不进入进化飞轮。${RESET}`)
        dirtyTraces++
        continue
      }
      
      // 5. 验证 Ground Truth
      const cmdParts = t.validationCommand.split(" ")
      const executable = cmdParts[0]
      const cmdArgs = cmdParts.slice(1)
      
      const isSuccess = await $`${executable} ${cmdArgs}`.cwd(targetDir).nothrow().quiet().then(res => res.exitCode === 0)
      
      if (isSuccess) {
        console.log(`${GREEN}✅ 测试通过: ${t.id} (Trace 存入高质量记忆库)${RESET}`)
        await fs.writeFile(path.join(successDir, `${t.id}-passed.json`), JSON.stringify({ id: t.id, category: t.category, prompt: t.prompt, status: "passed", timestamp: Date.now(), observerLog: sanitizeObserverLog(observer.getOutput().slice(-4000)) }, null, 2))
        passed++
      } else {
        console.log(`${RED}❌ 测试失败: ${t.id} (Trace 存入待反思失败用例库)${RESET}`)
        const traceFail = { id: t.id, category: t.category, prompt: t.prompt, status: "failed", timestamp: Date.now(), observerLog: sanitizeObserverLog(observer.getOutput().slice(-4000)), validationCommand: t.validationCommand }
        await fs.writeFile(path.join(failedDir, `${t.id}-failed.json`), JSON.stringify(traceFail, null, 2))
      }
    } catch (e) {
      console.log(`${RED}❌ 测试异常中断: ${t.id}${RESET}`)
      console.error(e)
      dirtyTraces++
    }
  }

  console.log(`\n${BLUE}==========================================${RESET}`)
  console.log(`📊 Beta 进化闭环 (Phase 1) 执行完毕`)
  console.log(`✅ 成功通过并收录高质量 Trace: ${passed}`)
  console.log(`❌ 失败但收录有效反思 Trace: ${allCases.length - passed - dirtyTraces}`)
  console.log(`🗑️ 被 Heuristic Filter 网关剔除的脏数据: ${dirtyTraces}`)
  console.log(`${BLUE}==========================================${RESET}`)
}

runBetaEvolutionLoop()
