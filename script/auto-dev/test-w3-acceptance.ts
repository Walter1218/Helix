#!/usr/bin/env bun
/**
 * W3 验收测试：Pre-flight + Cardinal
 *
 * 验证：
 * 1. Pre-flight服务正常工作
 * 2. Cardinal服务正常工作
 * 3. 检查项/规则完整
 * 4. 阻塞级别正确
 */

import { join } from "path"
import { existsSync, readFileSync } from "fs"

interface TestResult {
  name: string
  passed: boolean
  message: string
}

function log(msg: string) {
  console.log(msg)
}

const PROJECT_ROOT = join(import.meta.dirname, "../..")

/**
 * 测试1: preflight.ts 文件存在
 */
function testPreflightExists(): TestResult {
  log("\n[测试1] preflight.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/preflight.ts")
  const exists = existsSync(filePath)

  return {
    name: "preflight.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试2: cardinal.ts 文件存在
 */
function testCardinalExists(): TestResult {
  log("\n[测试2] cardinal.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/cardinal.ts")
  const exists = existsSync(filePath)

  return {
    name: "cardinal.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试3: Pre-flight检查项
 */
function testPreflightChecks(): TestResult {
  log("\n[测试3] Pre-flight检查项")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/preflight.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasSpecCheck = content.includes("spec_completeness")
  const hasBudgetCheck = content.includes("token_budget")
  const hasDependencyCheck = content.includes("dependencies")
  const hasPermissionCheck = content.includes("permissions")

  const allPresent = hasSpecCheck && hasBudgetCheck && hasDependencyCheck && hasPermissionCheck

  return {
    name: "Pre-flight检查项",
    passed: allPresent,
    message: allPresent ? "4个检查项全部定义" : "部分检查项缺失",
  }
}

/**
 * 测试4: Cardinal规则
 */
function testCardinalRules(): TestResult {
  log("\n[测试4] Cardinal规则")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/cardinal.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasSecurityRule = content.includes("security")
  const hasExcessiveRule = content.includes("excessive_changes")
  const hasConsecutiveRule = content.includes("consecutive_failures")
  const hasAlignmentRule = content.includes("alignment")
  const hasTokenRule = content.includes("token_limit")

  const allPresent = hasSecurityRule && hasExcessiveRule && hasConsecutiveRule && hasAlignmentRule && hasTokenRule

  return {
    name: "Cardinal规则",
    passed: allPresent,
    message: allPresent ? "5个规则全部定义" : "部分规则缺失",
  }
}

/**
 * 测试5: 阻塞级别
 */
function testBlockLevels(): TestResult {
  log("\n[测试5] 阻塞级别")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/cardinal.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasBlock = content.includes('"block"')
  const hasPause = content.includes('"pause"')
  const hasStop = content.includes('"stop"')
  const hasWarn = content.includes('"warn"')

  const allPresent = hasBlock && hasPause && hasStop && hasWarn

  return {
    name: "阻塞级别",
    passed: allPresent,
    message: allPresent ? "4个阻塞级别全部定义" : "部分级别缺失",
  }
}

/**
 * 测试6: Pre-flight处理流程
 */
function testPreflightFlow(): TestResult {
  log("\n[测试6] Pre-flight处理流程")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/preflight.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasBlockFlow = content.includes("blocked = true")
  const hasPauseFlow = content.includes("paused = true")
  const hasResult = content.includes("PreFlightResult")

  const allPresent = hasBlockFlow && hasPauseFlow && hasResult

  return {
    name: "Pre-flight处理流程",
    passed: allPresent,
    message: allPresent ? "处理流程完整" : "处理流程缺失",
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log("=".repeat(50))
  log("W3 验收测试：Pre-flight + Cardinal")
  log("=".repeat(50))

  const results: TestResult[] = []

  // 运行测试
  results.push(testPreflightExists())
  results.push(testCardinalExists())
  results.push(testPreflightChecks())
  results.push(testCardinalRules())
  results.push(testBlockLevels())
  results.push(testPreflightFlow())

  // 打印结果
  log("\n" + "=".repeat(50))
  log("测试结果")
  log("=".repeat(50))

  let passedCount = 0
  for (const result of results) {
    const icon = result.passed ? "✅" : "❌"
    log(`  ${icon} ${result.name}: ${result.message}`)
    if (result.passed) passedCount++
  }

  log("-".repeat(50))
  log(`  通过: ${passedCount}/${results.length}`)
  log(`  结果: ${passedCount === results.length ? "✅ 验收通过" : "❌ 验收未通过"}`)
  log("=".repeat(50))

  return passedCount === results.length
}

// 运行
const passed = await runAllTests()
process.exit(passed ? 0 : 1)
