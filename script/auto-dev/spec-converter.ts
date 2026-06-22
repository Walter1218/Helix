#!/usr/bin/env bun
/**
 * Spec Converter — 扫描 OpenSpec specs 目录，生成 roadmap 任务
 *
 * 用法:
 *   bun run script/auto-dev/spec-converter.ts [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs"
import { join } from "path"

const PROJECT_ROOT = join(import.meta.dirname, "../..")
const SPECS_DIR = join(PROJECT_ROOT, "openspec/specs")
const ROADMAP_PATH = join(PROJECT_ROOT, ".mimocode/roadmap.json")

export interface SpecTask {
  specPath: string
  requirement: string
  status: "pending" | "implemented" | "failed"
  estimatedTokens: number
}

interface RoadmapTask {
  id: string
  title: string
  description: string
  status: "pending" | "in_progress" | "done"
  priority: "critical" | "high" | "medium" | "low"
  estimated_tokens: number
  tags: string[]
  specPath?: string
}

interface Roadmap {
  version: string
  project: string
  milestones: Array<{
    id: string
    name: string
    status: string
    priority: string
    tasks: RoadmapTask[]
  }>
  current_focus: string
  auto_dev_config: {
    enabled: boolean
    daily_token_limit: number
    preferred_complexity: string[]
    focus_milestones: string[]
    skip_tags: string[]
  }
}

/**
 * 解析单个 spec.md 文件，提取 requirements
 */
export function parseSpecFile(specPath: string): SpecTask[] {
  if (!existsSync(specPath)) return []

  const content = readFileSync(specPath, "utf-8")
  const tasks: SpecTask[] = []

  const requirementBlocks = content.split(/^## /m).filter(section =>
    section.startsWith("Requirements") || section.startsWith("Requirement")
  )

  for (const block of requirementBlocks) {
    const lines = block.split("\n")
    let currentReq = ""
    let currentStatus: "pending" | "implemented" | "failed" = "pending"

    for (const line of lines) {
      const reqMatch = line.match(/^### (.+)/)
      if (reqMatch) {
        if (currentReq) {
          tasks.push({
            specPath,
            requirement: currentReq,
            status: currentStatus,
            estimatedTokens: estimateTokens(currentReq),
          })
        }
        currentReq = reqMatch[1].trim()
        currentStatus = "pending"
      }

      const statusMatch = line.match(/\*\*Status\*\*:\s*(pending|implemented|failed)/)
      if (statusMatch) {
        const status = statusMatch[1]
        if (status === "pending" || status === "implemented" || status === "failed") {
          currentStatus = status
        }
      }
    }

    if (currentReq) {
      tasks.push({
        specPath,
        requirement: currentReq,
        status: currentStatus,
        estimatedTokens: estimateTokens(currentReq),
      })
    }
  }

  return tasks
}

/**
 * 扫描 openspec/specs/ 目录下所有 spec.md
 */
export function scanSpecs(specsDir: string = SPECS_DIR): SpecTask[] {
  if (!existsSync(specsDir)) {
    console.log(`Specs 目录不存在: ${specsDir}`)
    return []
  }

  const allTasks: SpecTask[] = []

  const dirs = readdirSync(specsDir).filter(d => {
    const fullPath = join(specsDir, d)
    return statSync(fullPath).isDirectory()
  })

  for (const dir of dirs) {
    const specPath = join(specsDir, dir, "spec.md")
    const tasks = parseSpecFile(specPath)
    allTasks.push(...tasks)
  }

  return allTasks
}

/**
 * 根据需求描述估算 token 消耗
 */
function estimateTokens(requirement: string): number {
  const baseTokens = 30000
  const wordCount = requirement.split(/\s+/).length
  return baseTokens + wordCount * 500
}

/**
 * 从 spec 名称生成任务 ID
 */
function specNameToId(specPath: string): string {
  const parts = specPath.split("/")
  const specDir = parts[parts.length - 2]
  return specDir.toUpperCase().replace(/-/g, "_")
}

/**
 * 检查需求是否已在代码库中实现
 */
function checkImplementation(requirement: string): boolean {
  const keywords = requirement.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  if (keywords.length === 0) return false

  try {
    const { execSync } = require("child_process")
    const grepPattern = keywords.join("|")
    const result = execSync(
      `grep -r -l -i "${grepPattern}" packages/opencode/src/ 2>/dev/null | head -5`,
      { encoding: "utf-8", timeout: 10000 }
    )
    return result.trim().length > 0
  } catch {
    return false
  }
}

/**
 * 将 spec 任务合并到 roadmap
 */
export function mergeIntoRoadmap(specTasks: SpecTask[], roadmap: Roadmap): Roadmap {
  const newRoadmap = JSON.parse(JSON.stringify(roadmap))

  let specMilestone = newRoadmap.milestones.find((m: any) => m.id === "M_SPEC")
  if (!specMilestone) {
    specMilestone = {
      id: "M_SPEC",
      name: "OpenSpec 驱动任务",
      status: "pending",
      priority: "high",
      tasks: [],
    }
    newRoadmap.milestones.push(specMilestone)
  }

  const existingIds = new Set(specMilestone.tasks.map((t: RoadmapTask) => t.id))

  for (const specTask of specTasks) {
    if (specTask.status === "implemented") continue

    const specId = specNameToId(specTask.specPath)
    const taskId = `SPEC-${specId}-${specTask.requirement.replace(/\s+/g, "-").slice(0, 30).toUpperCase()}`

    if (existingIds.has(taskId)) continue

    const implemented = checkImplementation(specTask.requirement)
    if (implemented) continue

    specMilestone.tasks.push({
      id: taskId,
      title: `[Spec] ${specTask.requirement}`,
      description: `从 OpenSpec 导入: ${specTask.specPath}\n\n需求: ${specTask.requirement}`,
      status: "pending",
      priority: "medium",
      estimated_tokens: specTask.estimatedTokens,
      tags: ["openspec", "spec-driven"],
      specPath: specTask.specPath,
    })
  }

  return newRoadmap
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")

  console.log("OpenSpec Spec Converter")
  console.log("=".repeat(40))

  const specTasks = scanSpecs()
  console.log(`扫描到 ${specTasks.length} 个需求:`)

  for (const task of specTasks) {
    const icon = task.status === "implemented" ? "✓" : task.status === "failed" ? "✗" : "○"
    console.log(`  ${icon} ${task.requirement} [${task.status}]`)
  }

  const pendingTasks = specTasks.filter(t => t.status === "pending")
  console.log(`\n待处理: ${pendingTasks.length} 个`)

  if (dryRun) {
    console.log("\n[dry-run] 不修改 roadmap.json")
    return
  }

  if (!existsSync(ROADMAP_PATH)) {
    console.log("roadmap.json 不存在，跳过合并")
    return
  }

  const roadmap = JSON.parse(readFileSync(ROADMAP_PATH, "utf-8"))
  const updated = mergeIntoRoadmap(specTasks, roadmap)

  writeFileSync(ROADMAP_PATH, JSON.stringify(updated, null, 2))
  console.log("\n已更新 roadmap.json")
}

void main()
