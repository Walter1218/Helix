#!/usr/bin/env bun
/**
 * W4 验收测试：可观测性提升
 *
 * 验证：
 * 1. TraceReporter扩展功能
 * 2. HeuristicFilter扩展模式
 * 3. 采样配置支持
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
 * 测试1: trace-reporter.ts 采样支持
 */
function testTraceSampling(): TestResult {
  log("\n[测试1] trace-reporter.ts 采样支持")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/observability/trace-reporter.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasConfig = content.includes("TraceConfig")
  const hasSamplingEnabled = content.includes("samplingEnabled")
  const hasSamplingRate = content.includes("samplingRate")
  const hasMaxTraces = content.includes("maxTraces")
  const hasGetConfig = content.includes("getConfig")
  const hasUpdateConfig = content.includes("updateConfig")

  const allPresent = hasConfig && hasSamplingEnabled && hasSamplingRate && hasMaxTraces && hasGetConfig && hasUpdateConfig

  return {
    name: "trace-reporter.ts 采样支持",
    passed: allPresent,
    message: allPresent ? "采样配置完整" : "采样配置缺失",
  }
}

/**
 * 测试2: heuristic-filter.ts 扩展模式
 */
function testHeuristicPatterns(): TestResult {
  log("\n[测试2] heuristic-filter.ts 扩展模式")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/observability/heuristic-filter.ts")
  const content = readFileSync(filePath, "utf-8")

  // 基础设施错误
  const hasTimeout = content.includes("/timeout/i")
  const hasOOM = content.includes("/out\\s+of\\s+memory/i")

  // API/限流错误
  const hasRateLimit = content.includes("/rate\\s*limit/i")
  const hasQuotaExceeded = content.includes("/quota\\s*exceeded/i")
  const has429 = content.includes("/429/")

  // 资源错误
  const hasInsufficientFunds = content.includes("/insufficient\\s*funds/i")

  // 模型错误
  const hasModelOverloaded = content.includes("/model\\s*overloaded/i")
  const has503 = content.includes("/503/")

  // 上下文错误
  const hasContextLength = content.includes("/context\\s*length\\s*exceeded/i")
  const hasMaxTokens = content.includes("/max\\s*tokens\\s*exceeded/i")

  const allPresent = hasTimeout && hasOOM && hasRateLimit && hasQuotaExceeded && has429 &&
    hasInsufficientFunds && hasModelOverloaded && has503 && hasContextLength && hasMaxTokens

  return {
    name: "heuristic-filter.ts 扩展模式",
    passed: allPresent,
    message: allPresent ? "脏数据模式完整" : "部分模式缺失",
  }
}

/**
 * 测试3: 采样逻辑实现
 */
function testSamplingLogic(): TestResult {
  log("\n[测试3] 采样逻辑实现")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/observability/trace-reporter.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasSamplingCheck = content.includes("config.samplingEnabled && Math.random() > config.samplingRate")
  const hasMaxTracesCheck = content.includes("list.length >= config.maxTraces")

  const allPresent = hasSamplingCheck && hasMaxTracesCheck

  return {
    name: "采样逻辑实现",
    passed: allPresent,
    message: allPresent ? "采样逻辑完整" : "采样逻辑缺失",
  }
}

/**
 * 测试4: 默认配置
 */
function testDefaultConfig(): TestResult {
  log("\n[测试4] 默认配置")

  const filePath = join(PROJECT_ROOT, "packages/opencode/src/observability/trace-reporter.ts")
  const content = readFileSync(filePath, "utf-8")

  const hasDefaultConfig = content.includes("DEFAULT_CONFIG")
  const hasDefaultSampling = content.includes("samplingEnabled: false")
  const hasDefaultRate = content.includes("samplingRate: 1.0")
  const hasDefaultMax = content.includes("maxTraces: 10000")

  const allPresent = hasDefaultConfig && hasDefaultSampling && hasDefaultRate && hasDefaultMax

  return {
    name: "默认配置",
    passed: allPresent,
    message: allPresent ? "默认配置正确" : "默认配置缺失",
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log("=".repeat(50))
  log("W4 验收测试：可观测性提升")
  log("=".repeat(50))

  const results: TestResult[] = []

  // 运行测试
  results.push(testTraceSampling())
  results.push(testHeuristicPatterns())
  results.push(testSamplingLogic())
  results.push(testDefaultConfig())

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
