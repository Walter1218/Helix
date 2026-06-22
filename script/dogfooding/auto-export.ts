#!/usr/bin/env bun
/**
 * DPO Auto Export — 自动检查并导出DPO数据集
 *
 * 功能：
 * 1. 扫描 success/failed trace 目录
 * 2. 匹配同一任务的成功/失败trace
 * 3. 通过Judge验证门过滤脏数据
 * 4. 导出为JSONL格式供DPO训练
 *
 * 用法:
 *   bun run script/dogfooding/auto-export.ts [--force] [--dry-run]
 */

import { $, file } from "bun"
import path from "path"
import fs from "fs/promises"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

declare const Bun: any

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..")
const DOFOODING_DIR = path.join(PROJECT_ROOT, ".dogfooding")
const SUCCESS_DIR = path.join(DOFOODING_DIR, "success_traces")
const FAILED_DIR = path.join(DOFOODING_DIR, "failed_traces")
const DPO_DIR = path.join(DOFOODING_DIR, "dpo_dataset")

interface TraceData {
  id: string
  taskId?: string
  prompt?: string
  goal?: string
  diff?: string
  output?: string
  error?: string
  observerLog?: string
  success?: boolean
  timestamp?: number
  metadata?: Record<string, unknown>
}

interface DPOEntry {
  prompt: string
  chosen: string
  rejected: string
  judgeDecision?: "clean" | "suspicious"
  taskId?: string
  timestamp?: number
}

/**
 * Judge 验证门 — 防止"DCE（删断言骗通过）"的作弊轨迹进入 DPO 数据集
 */
function judgeEntry(entry: DPOEntry): "clean" | "suspicious" {
  const chosen = entry.chosen
  const rejected = entry.rejected

  // 规则 1: 断言数量检测
  const chosenAsserts = (chosen.match(/\b(expect|assert|assertEqual|assertTrue)\b/g) ?? []).length
  const rejectedAsserts = (rejected.match(/\b(expect|assert|assertEqual|assertTrue)\b/g) ?? []).length
  if (rejectedAsserts > 0 && chosenAsserts < rejectedAsserts) {
    return "suspicious"
  }

  // 规则 2: 代码量急剧缩水
  if (chosen.length < rejected.length * 0.3 && rejected.length > 100) {
    return "suspicious"
  }

  // 规则 3: 差异过小
  const diff = Math.abs(chosen.length - rejected.length)
  if (diff < 5 && chosen.length > 10) {
    return "suspicious"
  }

  // 规则 4: 空内容
  if (chosen.trim().length < 10 || rejected.trim().length < 10) {
    return "suspicious"
  }

  return "clean"
}

/**
 * 确保目录存在
 */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * 扫描目录中的trace文件
 */
async function scanTraces(dir: string): Promise<TraceData[]> {
  const traces: TraceData[] = []

  try {
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue

      try {
        const content = await fs.readFile(path.join(dir, file), "utf-8")
        const data = JSON.parse(content) as TraceData
        traces.push(data)
      } catch (e) {
        console.warn(`${YELLOW}⚠ 跳过无效文件: ${file}${RESET}`)
      }
    }
  } catch {
    // 目录不存在或为空
  }

  return traces
}

/**
 * 匹配同一任务的成功/失败trace
 */
function matchTraces(successTraces: TraceData[], failedTraces: TraceData[]): DPOEntry[] {
  const entries: DPOEntry[] = []

  for (const failed of failedTraces) {
    const taskId = failed.taskId ?? failed.id

    // 查找匹配的成功trace
    const matchingSuccess = successTraces.find(s => {
      const successTaskId = s.taskId ?? s.id
      return successTaskId === taskId || successTaskId.includes(taskId) || taskId.includes(successTaskId)
    })

    if (matchingSuccess) {
      entries.push({
        prompt: failed.prompt ?? failed.goal ?? "",
        chosen: matchingSuccess.diff ?? matchingSuccess.output ?? matchingSuccess.observerLog ?? "",
        rejected: failed.output ?? failed.error ?? failed.observerLog ?? "",
        taskId,
        timestamp: failed.timestamp,
      })
    }
  }

  return entries
}

/**
 * 导出DPO数据集
 */
async function exportDPO(entries: DPOEntry[], force: boolean, dryRun: boolean): Promise<void> {
  console.log(`\n${BLUE}🚀 DPO 自动导出${RESET}`)
  console.log(`${BLUE}==========================================${RESET}`)

  // 确保目录存在
  await ensureDir(DPO_DIR)

  // 扫描traces
  console.log(`${BLUE}📂 扫描 trace 文件...${RESET}`)
  const successTraces = await scanTraces(SUCCESS_DIR)
  const failedTraces = await scanTraces(FAILED_DIR)
  console.log(`  成功 traces: ${successTraces.length}`)
  console.log(`  失败 traces: ${failedTraces.length}`)

  // 如果没有足够的traces，使用传入的entries
  let allEntries = entries
  if (successTraces.length > 0 && failedTraces.length > 0) {
    const matchedEntries = matchTraces(successTraces, failedTraces)
    if (matchedEntries.length > 0) {
      allEntries = [...entries, ...matchedEntries]
    }
  }

  if (allEntries.length === 0) {
    console.log(`${YELLOW}⚠ 无可用的DPO数据对${RESET}`)
    return
  }

  console.log(`${BLUE}📊 总数据对: ${allEntries.length}${RESET}`)

  // Judge验证门
  console.log(`${BLUE}🔍 运行 Judge 验证门...${RESET}`)
  const cleanEntries: DPOEntry[] = []
  let suspiciousCount = 0

  for (const entry of allEntries) {
    const decision = judgeEntry(entry)
    entry.judgeDecision = decision
    if (decision === "clean") {
      cleanEntries.push(entry)
    } else {
      suspiciousCount++
    }
  }

  console.log(`  ✅ 通过验证: ${cleanEntries.length}`)
  console.log(`  ❌ 被拦截: ${suspiciousCount}`)

  if (cleanEntries.length === 0) {
    console.log(`${YELLOW}⚠ 无通过验证的数据${RESET}`)
    return
  }

  // 导出
  if (dryRun) {
    console.log(`${YELLOW}[dry-run] 将导出 ${cleanEntries.length} 条数据${RESET}`)
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputFile = path.join(DPO_DIR, `dpo_dataset_${timestamp}.jsonl`)

  let jsonlContent = ""
  for (const entry of cleanEntries) {
    jsonlContent += JSON.stringify({
      prompt: entry.prompt,
      chosen: entry.chosen,
      rejected: entry.rejected,
      taskId: entry.taskId,
      timestamp: entry.timestamp,
    }) + "\n"
  }

  await Bun.write(outputFile, jsonlContent)

  console.log(`\n${GREEN}✅ DPO 数据集已导出至: ${outputFile}${RESET}`)
  console.log(`${GREEN}✅ 数据条目: ${cleanEntries.length}${RESET}`)
  console.log(`${YELLOW}ℹ️ 该数据集可直接用于本地小模型的 DPO 偏好对齐微调。${RESET}`)
}

/**
 * 检查是否需要导出（避免频繁导出）
 */
async function shouldExport(): Promise<boolean> {
  try {
    const files = await fs.readdir(DPO_DIR)
    const today = new Date().toISOString().slice(0, 10)

    // 检查今天是否已经导出过
    const todayFiles = files.filter(f => f.includes(today) && f.endsWith(".jsonl"))
    if (todayFiles.length > 0) {
      console.log(`${YELLOW}ℹ 今天已导出过，跳过${RESET}`)
      return false
    }
  } catch {
    // 目录不存在，需要导出
  }

  return true
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const dryRun = args.includes("--dry-run")

  if (!force && !dryRun) {
    const should = await shouldExport()
    if (!should) return
  }

  await exportDPO([], force, dryRun)
}

// 只在直接运行时执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}

export { exportDPO, shouldExport, judgeEntry }
