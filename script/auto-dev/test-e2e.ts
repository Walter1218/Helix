#!/usr/bin/env bun
/**
 * 整体验收测试：端到端完整流程
 *
 * 验证：
 * 1. 所有模块文件存在
 * 2. 所有验收测试通过
 * 3. 类型检查通过
 */

import { join } from "path"
import { existsSync } from "fs"
import { execSync } from "child_process"

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
 * 测试1: 所有新增文件存在
 */
function testAllFilesExist(): TestResult {
  log("\n[测试1] 所有新增文件存在")

  const files = [
    // W1: 数据流打通
    "script/dogfooding/auto-export.ts",
    "script/dogfooding/test-w1-acceptance.ts",

    // W2: 模式注册表
    "packages/opencode/src/session/mode-registry.ts",
    "script/auto-dev/test-w2-acceptance.ts",

    // W3: Pre-flight + Cardinal
    "packages/opencode/src/session/preflight.ts",
    "packages/opencode/src/session/cardinal.ts",
    "script/auto-dev/test-w3-acceptance.ts",

    // W4: 可观测性提升
    "script/auto-dev/test-w4-acceptance.ts",

    // W5: 动态智能体
    "packages/opencode/src/agent/decomposition-gate.ts",
    "packages/opencode/src/agent/dynamic-agent.ts",
    "packages/opencode/src/agent/agent-stats.ts",
    "script/auto-dev/test-w5-acceptance.ts",
  ]

  const missingFiles = files.filter(f => !existsSync(join(PROJECT_ROOT, f)))

  return {
    name: "所有新增文件存在",
    passed: missingFiles.length === 0,
    message: missingFiles.length === 0 ? `${files.length} 个文件全部存在` : `缺失文件: ${missingFiles.join(", ")}`,
  }
}

/**
 * 测试2: 类型检查通过
 */
function testTypecheck(): TestResult {
  log("\n[测试2] 类型检查通过")

  try {
    execSync("bun typecheck", {
      cwd: join(PROJECT_ROOT, "packages/opencode"),
      stdio: "pipe",
    })

    return {
      name: "类型检查通过",
      passed: true,
      message: "类型检查通过",
    }
  } catch (err: any) {
    return {
      name: "类型检查通过",
      passed: false,
      message: `类型检查失败: ${err.message.slice(0, 100)}`,
    }
  }
}

/**
 * 测试3: W1验收测试
 */
function testW1(): TestResult {
  log("\n[测试3] W1验收测试")

  try {
    execSync("bun run script/dogfooding/test-w1-acceptance.ts", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    })

    return {
      name: "W1验收测试",
      passed: true,
      message: "W1验收通过",
    }
  } catch {
    return {
      name: "W1验收测试",
      passed: false,
      message: "W1验收失败",
    }
  }
}

/**
 * 测试4: W2验收测试
 */
function testW2(): TestResult {
  log("\n[测试4] W2验收测试")

  try {
    execSync("bun run script/auto-dev/test-w2-acceptance.ts", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    })

    return {
      name: "W2验收测试",
      passed: true,
      message: "W2验收通过",
    }
  } catch {
    return {
      name: "W2验收测试",
      passed: false,
      message: "W2验收失败",
    }
  }
}

/**
 * 测试5: W3验收测试
 */
function testW3(): TestResult {
  log("\n[测试5] W3验收测试")

  try {
    execSync("bun run script/auto-dev/test-w3-acceptance.ts", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    })

    return {
      name: "W3验收测试",
      passed: true,
      message: "W3验收通过",
    }
  } catch {
    return {
      name: "W3验收测试",
      passed: false,
      message: "W3验收失败",
    }
  }
}

/**
 * 测试6: W4验收测试
 */
function testW4(): TestResult {
  log("\n[测试6] W4验收测试")

  try {
    execSync("bun run script/auto-dev/test-w4-acceptance.ts", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    })

    return {
      name: "W4验收测试",
      passed: true,
      message: "W4验收通过",
    }
  } catch {
    return {
      name: "W4验收测试",
      passed: false,
      message: "W4验收失败",
    }
  }
}

/**
 * 测试7: W5验收测试
 */
function testW5(): TestResult {
  log("\n[测试7] W5验收测试")

  try {
    execSync("bun run script/auto-dev/test-w5-acceptance.ts", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    })

    return {
      name: "W5验收测试",
      passed: true,
      message: "W5验收通过",
    }
  } catch {
    return {
      name: "W5验收测试",
      passed: false,
      message: "W5验收失败",
    }
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  log("=".repeat(60))
  log("整体系统验收测试")
  log("=".repeat(60))

  const results: TestResult[] = []

  // 运行测试
  results.push(testAllFilesExist())
  results.push(testTypecheck())
  results.push(testW1())
  results.push(testW2())
  results.push(testW3())
  results.push(testW4())
  results.push(testW5())

  // 打印结果
  log("\n" + "=".repeat(60))
  log("测试结果汇总")
  log("=".repeat(60))

  let passedCount = 0
  for (const result of results) {
    const icon = result.passed ? "✅" : "❌"
    log(`  ${icon} ${result.name}: ${result.message}`)
    if (result.passed) passedCount++
  }

  log("-".repeat(60))
  log(`  通过: ${passedCount}/${results.length}`)
  log(`  结果: ${passedCount === results.length ? "✅ 整体验收通过" : "❌ 整体验收未通过"}`)
  log("=".repeat(60))

  return passedCount === results.length
}

// 运行
const passed = await runAllTests()
process.exit(passed ? 0 : 1)
