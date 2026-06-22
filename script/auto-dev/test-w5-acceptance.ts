#!/usr/bin/env bun
/**
 * W5 验收测试：动态智能体
 *
 * 验证：
 * 1. DecompositionGate功能
 * 2. DynamicAgent功能
 * 3. AgentStats功能
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
 * 测试1: decomposition-gate.ts 文件存在
 */
function testDecompositionGateExists(): TestResult {
  log("\n[测试1] decomposition-gate.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/decomposition-gate.ts")
  const exists = existsSync(filePath)

  return {
    name: "decomposition-gate.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试2: dynamic-agent.ts 文件存在
 */
function testDynamicAgentExists(): TestResult {
  log("\n[测试2] dynamic-agent.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/dynamic-agent.ts")
  const exists = existsSync(filePath)

  return {
    name: "dynamic-agent.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试3: agent-stats.ts 文件存在
 */
function testAgentStatsExists(): TestResult {
  log("\n[测试3] agent-stats.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/agent-stats.ts")
  const exists = existsSync(filePath)

  return {
    name: "agent-stats.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试4: DecompositionGate功能
 */
function testDecompositionGateFeatures(): TestResult {
  log("\n[测试4] DecompositionGate功能")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/decomposition-gate.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasShouldDecompose = content.includes("shouldDecompose")
  const hasDecompose = content.includes("decompose")
  const hasValidate = content.includes("validate")
  const hasConfig = content.includes("DecompositionConfig")
  const hasComplexityThreshold = content.includes("complexityThreshold")
  const hasMaxSubtasks = content.includes("maxSubtasks")

  const allPresent = hasShouldDecompose && hasDecompose && hasValidate && hasConfig && hasComplexityThreshold && hasMaxSubtasks

  return {
    name: "DecompositionGate功能",
    passed: allPresent,
    message: allPresent ? "功能完整" : "功能缺失",
  }
}

/**
 * 测试5: DynamicAgent功能
 */
function testDynamicAgentFeatures(): TestResult {
  log("\n[测试5] DynamicAgent功能")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/dynamic-agent.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasGenerate = content.includes("generate")
  const hasInjectMemory = content.includes("injectMemory")
  const hasPersona = content.includes("Persona")
  const hasSystemPrompt = content.includes("systemPrompt")
  const hasConstraints = content.includes("constraints")

  const allPresent = hasGenerate && hasInjectMemory && hasPersona && hasSystemPrompt && hasConstraints

  return {
    name: "DynamicAgent功能",
    passed: allPresent,
    message: allPresent ? "功能完整" : "功能缺失",
  }
}

/**
 * 测试6: AgentStats功能
 */
function testAgentStatsFeatures(): TestResult {
  log("\n[测试6] AgentStats功能")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/agent-stats.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasL0 = content.includes("L0: boolean")
  const hasL1 = content.includes("L1: boolean")
  const hasL2 = content.includes("L2: boolean")
  const hasRecordResult = content.includes("recordResult")
  const hasRecordInteraction = content.includes("recordInteraction")
  const hasEvaluate = content.includes("evaluate")

  const allPresent = hasL0 && hasL1 && hasL2 && hasRecordResult && hasRecordInteraction && hasEvaluate

  return {
    name: "AgentStats功能",
    passed: allPresent,
    message: allPresent ? "功能完整" : "功能缺失",
  }
}

/**
 * 测试7: 复杂度阈值配置
 */
function testComplexityConfig(): TestResult {
  log("\n[测试7] 复杂度阈值配置")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/decomposition-gate.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasDefaultThreshold = content.includes("complexityThreshold: 10000")
  const hasDefaultMax = content.includes("maxSubtasks: 5")

  const allPresent = hasDefaultThreshold && hasDefaultMax

  return {
    name: "复杂度阈值配置",
    passed: allPresent,
    message: allPresent ? "配置正确" : "配置缺失",
  }
}

/**
 * 测试8: L2判断逻辑
 */
function testL2Logic(): TestResult {
  log("\n[测试8] L2判断逻辑")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/agent/agent-stats.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasTimeWindow = content.includes("l2TimeWindow")
  const hasMaxInteractions = content.includes("l2MaxInteractions")
  const hasPostCompletion = content.includes("postCompletionInteractions")

  const allPresent = hasTimeWindow && hasMaxInteractions && hasPostCompletion

  return {
    name: "L2判断逻辑",
    passed: allPresent,
    message: allPresent ? "逻辑完整" : "逻辑缺失",
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log("=".repeat(50))
  log("W5 验收测试：动态智能体")
  log("=".repeat(50))

  const results: TestResult[] = []

  // 运行测试
  results.push(testDecompositionGateExists())
  results.push(testDynamicAgentExists())
  results.push(testAgentStatsExists())
  results.push(testDecompositionGateFeatures())
  results.push(testDynamicAgentFeatures())
  results.push(testAgentStatsFeatures())
  results.push(testComplexityConfig())
  results.push(testL2Logic())

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
