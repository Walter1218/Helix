import { $, file } from "bun"
import path from "path"
import fs from "fs/promises"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const RED = "\x1b[31m"

declare const Bun: any

export interface DPOEntry {
  prompt: string
  chosen: string
  rejected: string
  /** Judge 验证结果 */
  judgeDecision?: "clean" | "suspicious"
}

/**
 * Judge 验证门 —— 防止"DCE（删断言骗通过）"的作弊轨迹进入 DPO 数据集。
 *
 * 检测规则：
 * 1. Chosen 代码的断言数量 < Rejected 代码的断言数量 → "删断言骗通过" → suspicious
 * 2. Chosen 代码行数 < Rejected 的 30% → 可能是"把所有逻辑删光了" → suspicious
 * 3. Chosen 和 Rejected 差异极小 (< 5 chars) → 可能是无效用例 → suspicious
 */
function judgeEntry(entry: DPOEntry): "clean" | "suspicious" {
  const chosen = entry.chosen
  const rejected = entry.rejected

  // 规则 1: 断言数量检测
  const chosenAsserts = (chosen.match(/\b(expect|assert|assertEqual|assertTrue)\b/g) ?? []).length
  const rejectedAsserts = (rejected.match(/\b(expect|assert|assertEqual|assertTrue)\b/g) ?? []).length
  if (rejectedAsserts > 0 && chosenAsserts < rejectedAsserts) {
    console.log(
      `${YELLOW}⚠️  Judge: 断言数量下降 (${rejectedAsserts} → ${chosenAsserts})，标记为 suspicious${RESET}`,
    )
    return "suspicious"
  }

  // 规则 2: 代码量急剧缩水
  if (chosen.length < rejected.length * 0.3 && rejected.length > 100) {
    console.log(
      `${YELLOW}⚠️  Judge: 代码量缩水 ${((chosen.length / rejected.length) * 100).toFixed(0)}%，标记为 suspicious${RESET}`,
    )
    return "suspicious"
  }

  // 规则 3: 差异过小
  const diff = Math.abs(chosen.length - rejected.length)
  if (diff < 5 && chosen.length > 10) {
    console.log(`${YELLOW}⚠️  Judge: 差异过小 (${diff} chars)，标记为 suspicious${RESET}`)
    return "suspicious"
  }

  return "clean"
}

async function exportDpoDataset() {
  console.log(`\n${BLUE}🚀 启动 DPO 轨迹打包工具 (Phase 3: 数据飞轮与微调降本)...${RESET}`)

  const dpoDir = path.resolve(".dogfooding/dpo_dataset")
  await fs.mkdir(dpoDir, { recursive: true })

  const failedTracesDir = path.resolve(".dogfooding/failed_traces")
  const successTracesDir = path.resolve(".dogfooding/success_traces")

  await fs.mkdir(failedTracesDir, { recursive: true })
  await fs.mkdir(successTracesDir, { recursive: true })

  // In production:
  // 1. Join failed trace (rejected) with a later successful retry (chosen) on the same task ID
  // 2. Filter out traces that were blocked by HeuristicFilter
  // 3. Judge validation gate — reject DCE / assertion-stripping cheats
  // 4. Format into the standard JSONL for HuggingFace/TRL DPO training

  // Read from actual traces if available
  let allEntries: DPOEntry[] = []

  try {
    // Try to read from success/failed trace pairs
    const failedFiles = await fs.readdir(failedTracesDir)
    const successFiles = await fs.readdir(successTracesDir)

    for (const ff of failedFiles) {
      if (!ff.endsWith(".json")) continue
      const failedContent = await fs.readFile(path.join(failedTracesDir, ff), "utf-8")
      const failedData = JSON.parse(failedContent)

      // Find matching success trace
      const taskId = failedData.id ?? ff.replace(".json", "").replace("-failed", "")
      const matchingSuccess = successFiles.find(
        (sf) => sf.includes(taskId) && sf.endsWith(".json"),
      )

      if (matchingSuccess) {
        const successContent = await fs.readFile(path.join(successTracesDir, matchingSuccess), "utf-8")
        const successData = JSON.parse(successContent)
        allEntries.push({
          prompt: failedData.prompt ?? failedData.goal ?? "",
          chosen: successData.diff ?? successData.output ?? successData.observerLog ?? "",
          rejected: failedData.output ?? failedData.error ?? failedData.observerLog ?? "",
        })
      }
    }
  } catch {
    console.log(`${YELLOW}未发现结构化 Trace 文件，使用样例数据...${RESET}`)
  }

  // Fallback: mock data
  if (allEntries.length === 0) {
    allEntries = [
      {
        prompt: "Implement a counter component in React.",
        chosen:
          "import React, { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(count + 1)}>{count}</button>;\n}",
        rejected:
          "export function Counter() {\n  let count = 0;\n  return <button onClick={() => count++}>{count}</button>;\n}",
      },
    ]
  }

  // === Judge 验证门 ===
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

  // === 导出 ===
  const outputFile = path.join(dpoDir, `dpo_dataset_${Date.now()}.jsonl`)

  let jsonlContent = ""
  for (const entry of cleanEntries) {
    jsonlContent += JSON.stringify(entry) + "\n"
  }

  await Bun.write(outputFile, jsonlContent)

  console.log(`${GREEN}✅ DPO 数据集已导出至: ${outputFile}${RESET}`)
  console.log(`${GREEN}✅ 通过 Judge 验证的干净条目: ${cleanEntries.length}${RESET}`)
  if (suspiciousCount > 0) {
    console.log(
      `${RED}❌ 被 Judge 判定为 suspicious (删断言/代码缩水) 的条目: ${suspiciousCount} (已排除)${RESET}`,
    )
  }
  console.log(`${YELLOW}ℹ️ 该数据集可直接用于本地小模型 (如 8B/14B) 的 DPO 偏好对齐微调。${RESET}`)
  console.log(`\n${BLUE}==========================================${RESET}`)
}

exportDpoDataset()
