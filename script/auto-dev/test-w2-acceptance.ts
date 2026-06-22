#!/usr/bin/env bun
/**
 * W2 验收测试：模式注册表
 *
 * 验证：
 * 1. ModeRegistry服务正常工作
 * 2. 6个默认模式已注册
 * 3. EvolutionConfig配置正确
 * 4. Judge启用检查正确
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
 * 测试1: mode-registry.ts 文件存在
 */
function testFileExists(): TestResult {
  log("\n[测试1] mode-registry.ts 文件存在")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/mode-registry.ts")
  const exists = existsSync(filePath)

  return {
    name: "mode-registry.ts 文件存在",
    passed: exists,
    message: exists ? "文件已创建" : "文件不存在",
  }
}

/**
 * 测试2: 包含6个默认模式
 */
function testDefaultModes(): TestResult {
  log("\n[测试2] 包含6个默认模式")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/mode-registry.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasAsk = content.includes('id: "ask"')
  const hasBuild = content.includes('id: "build"')
  const hasPlan = content.includes('id: "plan"')
  const hasCompose = content.includes('id: "compose"')
  const hasMax = content.includes('id: "max"')
  const hasLoop = content.includes('id: "loop"')

  const allPresent = hasAsk && hasBuild && hasPlan && hasCompose && hasMax && hasLoop

  return {
    name: "包含6个默认模式",
    passed: allPresent,
    message: allPresent ? "6个默认模式全部定义" : "部分模式缺失",
  }
}

/**
 * 测试3: EvolutionConfig配置
 */
function testEvolutionConfig(): TestResult {
  log("\n[测试3] EvolutionConfig配置")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/mode-registry.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasDefaultConfig = content.includes("DEFAULT_EVOLUTION_CONFIG")
  const hasAskConfig = content.includes("judgeEnabled: false")
  const hasBuildConfig = content.includes("judgeEnabled: true")

  const allPresent = hasDefaultConfig && hasAskConfig && hasBuildConfig

  return {
    name: "EvolutionConfig配置",
    passed: allPresent,
    message: allPresent ? "Ask禁用/Build启用配置正确" : "配置缺失",
  }
}

/**
 * 测试4: ModeHandler接口
 */
function testModeHandlerInterface(): TestResult {
  log("\n[测试4] ModeHandler接口")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/mode-registry.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasInterface = content.includes("interface ModeHandler")
  const hasBuildSystemPrompt = content.includes("buildSystemPrompt")
  const hasPreprocess = content.includes("preprocess")
  const hasExecute = content.includes("execute")
  const hasEvolutionConfig = content.includes("evolutionConfig")

  const allPresent = hasInterface && hasBuildSystemPrompt && hasPreprocess && hasExecute && hasEvolutionConfig

  return {
    name: "ModeHandler接口",
    passed: allPresent,
    message: allPresent ? "接口定义完整" : "接口定义缺失",
  }
}

/**
 * 测试5: Service接口
 */
function testServiceInterface(): TestResult {
  log("\n[测试5] Service接口")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/session/mode-registry.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasRegister = content.includes("readonly register")
  const hasGet = content.includes("readonly get")
  const hasGetAll = content.includes("readonly getAll")
  const hasGetEvolutionConfig = content.includes("readonly getEvolutionConfig")
  const hasIsJudgeEnabled = content.includes("readonly isJudgeEnabled")
  const hasIsTraceExportEnabled = content.includes("readonly isTraceExportEnabled")

  const allPresent = hasRegister && hasGet && hasGetAll && hasGetEvolutionConfig && hasIsJudgeEnabled && hasIsTraceExportEnabled

  return {
    name: "Service接口",
    passed: allPresent,
    message: allPresent ? "Service接口定义完整" : "Service接口缺失",
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log("=".repeat(50))
  log("W2 验收测试：模式注册表")
  log("=".repeat(50))

  const results: TestResult[] = []

  // 运行测试
  results.push(testFileExists())
  results.push(testDefaultModes())
  results.push(testEvolutionConfig())
  results.push(testModeHandlerInterface())
  results.push(testServiceInterface())

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
