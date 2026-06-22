#!/usr/bin/env bun
/**
 * OpenSpec 触发机制测试
 *
 * 验证所有类型的任务都能触发 spec 回写
 */

import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { findSpecForTask } from "./spec-writer"

const TEST_DIR = join(import.meta.dirname, "../../.test-openspec-trigger")
const SPECS_DIR = join(TEST_DIR, "specs")

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true })
  }
}

function setup() {
  cleanup()
  mkdirSync(SPECS_DIR, { recursive: true })

  // 创建 auth-session spec
  mkdirSync(join(SPECS_DIR, "auth-session"), { recursive: true })
  writeFileSync(join(SPECS_DIR, "auth-session/spec.md"), `# Auth Session

## Requirements

### Session expiration
The system SHALL support configurable session expiration periods.

**Status**: pending

### Remember me
The system SHALL support a "remember me" feature.

**Status**: pending
`)

  // 创建 auto-dev spec
  mkdirSync(join(SPECS_DIR, "auto-dev"), { recursive: true })
  writeFileSync(join(SPECS_DIR, "auto-dev/spec.md"), `# Auto Dev

## Requirements

### Automatic scheduling
The system SHALL support cron-based automatic task execution.

**Status**: pending

### Pipeline verification
The system SHALL run build, typecheck, test, and lint after each task.

**Status**: pending
`)

  // 创建 judge-agent spec
  mkdirSync(join(SPECS_DIR, "judge-agent"), { recursive: true })
  writeFileSync(join(SPECS_DIR, "judge-agent/spec.md"), `# Judge Agent

## Requirements

### Assertion protection
The system SHALL detect and block assertion deletions in test files.

**Status**: pending

### Context-aware review
The system SHALL use spec.md as context for judging code changes.

**Status**: pending
`)

  // 创建 feishu-gateway spec
  mkdirSync(join(SPECS_DIR, "feishu-gateway"), { recursive: true })
  writeFileSync(join(SPECS_DIR, "feishu-gateway/spec.md"), `# Feishu Gateway

## Requirements

### Message bridging
The system SHALL bridge messages between Feishu and the agent system.

**Status**: pending

### Notification delivery
The system SHALL send execution reports and alerts to Feishu.

**Status**: pending
`)
}

// 测试用例
const testCases = [
  {
    name: "普通 roadmap 任务 - auth 相关",
    description: "实现用户认证会话过期功能",
    expectedSpec: "auth-session",
  },
  {
    name: "普通 roadmap 任务 - auto-dev 相关",
    description: "改进自动调度能力，支持定时任务执行",
    expectedSpec: "auto-dev",
  },
  {
    name: "普通 roadmap 任务 - judge 相关",
    description: "增强 Judge Agent 的断言保护检测",
    expectedSpec: "judge-agent",
  },
  {
    name: "普通 roadmap 任务 - feishu 相关",
    description: "优化飞书消息桥接和通知推送",
    expectedSpec: "feishu-gateway",
  },
  {
    name: "OpenSpec 导入任务",
    description: "从 OpenSpec 导入: openspec/specs/auth-session/spec.md\n\n需求: Session expiration",
    expectedSpec: "auth-session",
  },
  {
    name: "模糊匹配任务",
    description: "修复 session 管理中的 remember me 功能",
    expectedSpec: "auth-session",
  },
  {
    name: "无法匹配的任务",
    description: "优化数据库查询性能",
    expectedSpec: null,
  },
]

async function main() {
  console.log("OpenSpec 触发机制测试")
  console.log("=".repeat(50))

  setup()

  let passed = 0
  let failed = 0

  for (const tc of testCases) {
    const result = findSpecForTask(tc.description, SPECS_DIR)
    const matched = result ? result.specPath.includes(tc.expectedSpec || "___NONE___") : tc.expectedSpec === null

    if (matched) {
      console.log(`✓ ${tc.name}`)
      if (result) {
        console.log(`    匹配到: ${result.specPath}`)
        console.log(`    需求: ${result.requirement}`)
      }
      passed++
    } else {
      console.log(`✗ ${tc.name}`)
      console.log(`    期望: ${tc.expectedSpec}`)
      console.log(`    实际: ${result ? result.specPath : "null"}`)
      failed++
    }
    console.log("")
  }

  cleanup()

  console.log("=".repeat(50))
  console.log(`结果: ${passed}/${passed + failed} 通过`)

  if (failed > 0) {
    process.exit(1)
  }
}

void main()
