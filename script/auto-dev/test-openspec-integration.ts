#!/usr/bin/env bun
/**
 * OpenSpec 集成测试
 *
 * 验证 spec-converter、spec-writer、judge-enhanced 的完整流程
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { scanSpecs, parseSpecFile, mergeIntoRoadmap } from "./spec-converter"
import { updateSpecStatus } from "./spec-writer"
import { judgeWithContext } from "./judge-enhanced"

const TEST_DIR = join(import.meta.dirname, "../../.test-openspec")
const SPECS_DIR = join(TEST_DIR, "specs")

// 清理测试目录
function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
}

// 创建测试环境
function setup() {
  cleanup()
  mkdirSync(SPECS_DIR, { recursive: true })

  // 创建测试 spec（使用独特的名称避免被误判为已实现）
  const specContent = `# Test Feature

## Requirements

### XyzyUniqueRequirementAlpha
The system SHALL support xyzy unique requirement alpha.

**Status**: pending

### XyzyUniqueRequirementBeta
The system SHALL support xyzy unique requirement beta.

**Status**: implemented
`
  mkdirSync(join(SPECS_DIR, "test-feature"), { recursive: true })
  writeFileSync(join(SPECS_DIR, "test-feature/spec.md"), specContent)
}

// 测试 spec 解析
function testParseSpec() {
  console.log("测试: spec 解析")

  const specPath = join(SPECS_DIR, "test-feature/spec.md")
  const tasks = parseSpecFile(specPath)

  console.log(`  解析到 ${tasks.length} 个需求`)

  const pending = tasks.filter(t => t.status === "pending")
  const implemented = tasks.filter(t => t.status === "implemented")

  console.log(`  待处理: ${pending.length}, 已实现: ${implemented.length}`)

  if (tasks.length !== 2) {
    console.error("  ✗ 需求总数不正确")
    return false
  }

  if (pending.length !== 1) {
    console.error("  ✗ 待处理数量不正确")
    return false
  }

  console.log("  ✓ spec 解析通过")
  return true
}

// 测试 spec 扫描
function testScanSpecs() {
  console.log("测试: spec 扫描")

  const tasks = scanSpecs(SPECS_DIR)

  console.log(`  扫描到 ${tasks.length} 个需求`)

  if (tasks.length !== 2) {
    console.error("  ✗ 扫描结果不正确")
    return false
  }

  console.log("  ✓ spec 扫描通过")
  return true
}

// 测试 spec 回写
function testSpecWriteback() {
  console.log("测试: spec 回写")

  const specPath = join(SPECS_DIR, "test-feature/spec.md")
  const success = updateSpecStatus(specPath, "XyzyUniqueRequirementAlpha", {
    success: true,
    output: "测试成功",
    tokensUsed: 12345,
  })

  if (!success) {
    console.error("  ✗ 回写失败")
    return false
  }

  const content = readFileSync(specPath, "utf-8")
  if (!content.includes("✅ implemented")) {
    console.error("  ✗ 状态未更新")
    return false
  }

  if (!content.includes("12,345")) {
    console.error("  ✗ token 数未记录")
    return false
  }

  console.log("  ✓ spec 回写通过")
  return true
}

// 测试 roadmap 合并
function testRoadmapMerge() {
  console.log("测试: roadmap 合并")

  const tasks = scanSpecs(SPECS_DIR)
  const roadmap = {
    version: "1.0",
    project: "Test",
    milestones: [],
    current_focus: "M1",
    auto_dev_config: {
      enabled: true,
      daily_token_limit: 1000000,
      preferred_complexity: ["simple"],
      focus_milestones: ["M1"],
      skip_tags: [],
    },
  }

  const updated = mergeIntoRoadmap(tasks, roadmap)
  const specMilestone = updated.milestones.find(m => m.id === "M_SPEC")

  if (!specMilestone) {
    console.error("  ✗ M_SPEC 里程碑未创建")
    return false
  }

  // 只有 pending 的需求会被添加
  if (specMilestone.tasks.length !== 1) {
    console.error(`  ✗ 任务数量不正确: ${specMilestone.tasks.length}`)
    return false
  }

  console.log("  ✓ roadmap 合并通过")
  return true
}

// 测试增强 Judge
function testEnhancedJudge() {
  console.log("测试: 增强 Judge")

  const verdict = judgeWithContext({
    task: {
      id: "TEST-1",
      title: "测试任务",
      description: "实现测试功能",
    },
    diff: `+ const x = eval("1+1")`,
    changedFiles: ["src/test.ts"],
  })

  if (verdict.approved) {
    console.error("  ✗ 应该检测到 eval 调用")
    return false
  }

  if (!verdict.issues.some(i => i.includes("eval"))) {
    console.error("  ✗ 未报告 eval 问题")
    return false
  }

  console.log("  ✓ 增强 Judge 通过")
  return true
}

// 运行所有测试
async function main() {
  console.log("OpenSpec 集成测试")
  console.log("=".repeat(40))

  setup()

  const results = [
    testParseSpec(),
    testScanSpecs(),
    testRoadmapMerge(),
    testSpecWriteback(),
    testEnhancedJudge(),
  ]

  cleanup()

  const passed = results.filter(r => r).length
  const total = results.length

  console.log("\n" + "=".repeat(40))
  console.log(`结果: ${passed}/${total} 通过`)

  if (passed < total) {
    process.exit(1)
  }
}

void main()
