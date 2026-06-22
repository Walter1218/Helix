#!/usr/bin/env bun
/**
 * Judge 增强验收测试
 *
 * 验证：
 * 1. 正常开发应该通过
 * 2. 非预期开发应该被拦截
 */

import { judgeWithContext, JudgeContext } from "./judge-enhanced"

interface TestCase {
  name: string
  ctx: JudgeContext
  expectedApproved: boolean
  expectedIssues?: string[]  // 期望包含的关键字
  expectedSuggestions?: string[]
}

const testCases: TestCase[] = [
  // ===== 正常开发场景（应该通过）=====
  {
    name: "✓ 正常功能开发 - 简单改动",
    ctx: {
      task: {
        id: "T1",
        title: "添加日志记录",
        description: "在用户登录时添加日志记录功能",
      },
      diff: `+import { log } from "@/logger"
+export function recordLogin(userId: string) {
+  log(\`User \${userId} logged in\`)
+}`,
      changedFiles: ["src/auth/login.ts"],
    },
    expectedApproved: true,
  },
  {
    name: "✓ 正常 Bug 修复 - 修复类型错误",
    ctx: {
      task: {
        id: "T2",
        title: "修复类型错误",
        description: "修复 getUser 返回值类型",
      },
      diff: `-export function getUser(id: string) {
-  return db.query(id) as any
+export function getUser(id: string): User | undefined {
+  return db.query(id) as User | undefined
+}`,
      changedFiles: ["src/user/service.ts"],
    },
    expectedApproved: true,
  },
  {
    name: "✓ 正常测试添加",
    ctx: {
      task: {
        id: "T3",
        title: "添加单元测试",
        description: "为 getUser 函数添加单元测试",
      },
      diff: `+import { describe, test, expect } from "bun:test"
+import { getUser } from "./service"
+
+describe("getUser", () => {
+  test("should return user by id", () => {
+    const user = getUser("123")
+    expect(user).toBeDefined()
+    expect(user?.id).toBe("123")
+  })
+})`,
      changedFiles: ["src/user/service.test.ts"],
    },
    expectedApproved: true,
  },

  // ===== 非预期开发场景（应该被拦截）=====
  {
    name: "✗ 检测到 eval 调用",
    ctx: {
      task: {
        id: "T4",
        title: "动态执行代码",
        description: "添加动态代码执行功能",
      },
      diff: `+export function executeCode(code: string) {
+  return eval(code)
+}`,
      changedFiles: ["src/utils/execute.ts"],
    },
    expectedApproved: false,
    expectedIssues: ["eval/exec"],
  },
  {
    name: "✗ 检测到密钥泄露",
    ctx: {
      task: {
        id: "T5",
        title: "配置 API",
        description: "添加 API 配置",
      },
      diff: `+const config = {
+  apiKey: "sk-abc123def456ghi789jkl012mno345pqr678stu901vwx",
+  endpoint: "https://api.example.com"
+}`,
      changedFiles: ["src/config.ts"],
    },
    expectedApproved: false,
    expectedIssues: ["密钥泄露"],
  },
  {
    name: "✗ 删除导出函数",
    ctx: {
      task: {
        id: "T6",
        title: "重构工具函数",
        description: "重构 utils 模块",
      },
      diff: `-export function helperA() {
-  return "a"
-}
-
-export function helperB() {
-  return "b"
-}
+export function newHelper() {
+  return "new"
+}`,
      changedFiles: ["src/utils/index.ts"],
    },
    expectedApproved: false,
    expectedIssues: ["删除的导出"],
  },
  {
    name: "✗ 函数参数减少",
    ctx: {
      task: {
        id: "T7",
        title: "简化函数签名",
        description: "简化 processData 函数",
      },
      diff: `-export function processData(data: Data, options: Options, callback: Callback) {
-  // process
+export function processData(data: Data) {
+  // simplified
+}`,
      changedFiles: ["src/processor.ts"],
    },
    expectedApproved: false,
    expectedIssues: ["参数数量减少"],
  },
  {
    name: "✗ 使用了 any 类型",
    ctx: {
      task: {
        id: "T8",
        title: "快速修复",
        description: "快速修复类型问题",
      },
      diff: `+export function getData(): any {
+  return fetch("/api/data")
+}`,
      changedFiles: ["src/api.ts"],
    },
    expectedApproved: true,
    expectedSuggestions: ["any 类型"],
  },
  {
    name: "✗ 检测到 console.log",
    ctx: {
      task: {
        id: "T9",
        title: "添加调试日志",
        description: "添加调试日志",
      },
      diff: `+export function debug() {
+  console.log("debug info")
+  console.error("error info")
+}`,
      changedFiles: ["src/debug.ts"],
    },
    expectedApproved: true,
    expectedSuggestions: ["console.log"],
  },
  {
    name: "✗ 检测到 magic number",
    ctx: {
      task: {
        id: "T10",
        title: "设置超时",
        description: "设置超时时间",
      },
      diff: `+export function setTimeout() {
+  return 86400000
+}`,
      changedFiles: ["src/config.ts"],
    },
    expectedApproved: true,
    expectedSuggestions: ["magic number"],
  },
  {
    name: "✗ 过深的相对路径导入",
    ctx: {
      task: {
        id: "T11",
        title: "导入工具",
        description: "导入工具函数",
      },
      diff: `+import { helper } from "../../../utils/helper"`,
      changedFiles: ["src/deep/module.ts"],
    },
    expectedApproved: true,
    expectedSuggestions: ["相对路径导入"],
  },
]

// 运行测试
async function main() {
  console.log("Judge 增强验收测试")
  console.log("=".repeat(60))

  let passed = 0
  let failed = 0

  for (const tc of testCases) {
    const verdict = judgeWithContext(tc.ctx)

    // 检查审批结果
    const approvalMatch = verdict.approved === tc.expectedApproved

    // 检查是否包含期望的问题关键字
    const issuesMatch = !tc.expectedIssues || tc.expectedIssues.every(keyword =>
      verdict.issues.some(issue => issue.includes(keyword))
    )

    // 检查是否包含期望的建议关键字
    const suggestionsMatch = !tc.expectedSuggestions || tc.expectedSuggestions.every(keyword =>
      verdict.suggestions.some(suggestion => suggestion.includes(keyword))
    )

    const allMatch = approvalMatch && issuesMatch && suggestionsMatch

    if (allMatch) {
      console.log(`✓ ${tc.name}`)
      passed++
    } else {
      console.log(`✗ ${tc.name}`)
      if (!approvalMatch) {
        console.log(`    期望 approved=${tc.expectedApproved}, 实际=${verdict.approved}`)
      }
      if (!issuesMatch) {
        console.log(`    期望 issues 包含: ${tc.expectedIssues?.join(", ")}`)
        console.log(`    实际 issues: ${verdict.issues.join("; ") || "无"}`)
      }
      if (!suggestionsMatch) {
        console.log(`    期望 suggestions 包含: ${tc.expectedSuggestions?.join(", ")}`)
        console.log(`    实际 suggestions: ${verdict.suggestions.join("; ") || "无"}`)
      }
      failed++
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`结果: ${passed}/${passed + failed} 通过`)

  if (failed > 0) {
    process.exit(1)
  }
}

void main()
