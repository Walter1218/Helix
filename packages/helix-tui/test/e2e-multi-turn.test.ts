import { describe, test, expect } from "bun:test"
import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"
const TIMEOUT = 120_000

const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })

let serverReachable = false
try {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  const res = await fetch(`${SERVER_URL}/global/health`, { signal: controller.signal, headers: authHeader })
  clearTimeout(timeout)
  serverReachable = res.ok
} catch {
  serverReachable = false
}

const testFn = serverReachable ? test : test.skip

async function chat(sessionID: string, message: string): Promise<string> {
  const result = await client.session.prompt({
    sessionID,
    parts: [{ type: "text", text: message }],
  })
  return result.data!.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text || p.content)
    .join("")
}

describe("E2E: 多轮对话 - 创建 Todo 应用", () => {
  testFn(
    "完整多轮对话流程",
    async () => {
      const session = await client.session.create({ title: "Todo 应用开发" })
      const sid = session.data!.id
      const conversation: { role: string; content: string }[] = []

      // 第1轮：提出任务
      console.log("\n=== 第1轮: 用户提出任务 ===")
      const r1 = await chat(sid, "帮我用 Python 创建一个简单的 todo 命令行应用，支持添加、列出、完成任务")
      conversation.push({ role: "user", content: "帮我用 Python 创建一个简单的 todo 命令行应用，支持添加、列出、完成任务" })
      conversation.push({ role: "assistant", content: r1 })
      console.log("AI 回复长度:", r1.length)
      expect(r1.length).toBeGreaterThan(50)
      console.log("回复摘要:", r1.slice(0, 200))

      // 第2轮：追问细节
      console.log("\n=== 第2轮: 追问实现细节 ===")
      const r2 = await chat(sid, "数据存储用什么方式？能持久化到文件吗？")
      conversation.push({ role: "user", content: "数据存储用什么方式？能持久化到文件吗？" })
      conversation.push({ role: "assistant", content: r2 })
      console.log("AI 回复长度:", r2.length)
      expect(r2.length).toBeGreaterThan(10)

      // 第3轮：要求修改
      console.log("\n=== 第3轮: 要求修改 ===")
      const r3 = await chat(sid, "好的，请加上优先级功能（高/中/低），并且列出时按优先级排序")
      conversation.push({ role: "user", content: "好的，请加上优先级功能（高/中/低），并且列出时按优先级排序" })
      conversation.push({ role: "assistant", content: r3 })
      console.log("AI 回复长度:", r3.length)
      expect(r3.length).toBeGreaterThan(50)

      // 第4轮：要求测试
      console.log("\n=== 第4轮: 要求写测试 ===")
      const r4 = await chat(sid, "请为这个 todo 应用写单元测试")
      conversation.push({ role: "user", content: "请为这个 todo 应用写单元测试" })
      conversation.push({ role: "assistant", content: r4 })
      console.log("AI 回复长度:", r4.length)
      expect(r4.length).toBeGreaterThan(50)

      // 第5轮：要求运行测试
      console.log("\n=== 第5轮: 要求运行测试 ===")
      const r5 = await chat(sid, "运行测试看看是否通过")
      conversation.push({ role: "user", content: "运行测试看看是否通过" })
      conversation.push({ role: "assistant", content: r5 })
      console.log("AI 回复长度:", r5.length)
      expect(r5.length).toBeGreaterThan(30)

      // 第6轮：总结
      console.log("\n=== 第6轮: 要求总结 ===")
      const r6 = await chat(sid, "总结一下这个 todo 应用的功能和文件结构")
      conversation.push({ role: "user", content: "总结一下这个 todo 应用的功能和文件结构" })
      conversation.push({ role: "assistant", content: r6 })
      console.log("AI 回复长度:", r6.length)
      expect(r6.length).toBeGreaterThan(50)

      // 验证对话连贯性
      console.log("\n=== 对话统计 ===")
      console.log("总轮次:", conversation.length / 2)
      console.log("用户消息:", conversation.filter((m) => m.role === "user").length)
      console.log("AI 回复:", conversation.filter((m) => m.role === "assistant").length)
      console.log(
        "总字数:",
        conversation.reduce((sum, m) => sum + m.content.length, 0),
      )

      // 验证 AI 记住了上下文
      expect(r2.toLowerCase()).toMatch(/存储|文件|json|持久化/)
      expect(r3.toLowerCase()).toMatch(/优先级|高|中|低/)
      expect(r4.toLowerCase()).toMatch(/测试|test/)
    },
    TIMEOUT * 6,
  )
})

describe("E2E: 多轮对话 - Bug 调试", () => {
  testFn(
    "连续调试流程",
    async () => {
      const session = await client.session.create({ title: "Bug 调试" })
      const sid = session.data!.id

      // 第1轮：报告 bug
      console.log("\n=== 第1轮: 报告 bug ===")
      const r1 = await chat(
        sid,
        `我有一个 Python 函数有 bug：
\`\`\`python
def calculate_average(numbers):
    total = sum(numbers)
    return total / len(numbers)
\`\`\`
当传入空列表时会报错 ZeroDivisionError，帮我修复`,
      )
      console.log("AI 回复:", r1.slice(0, 300))
      expect(r1.length).toBeGreaterThan(30)

      // 第2轮：确认修复
      console.log("\n=== 第2轮: 确认修复方案 ===")
      const r2 = await chat(sid, "好的，还有个问题，如果列表里有非数字类型怎么办？")
      console.log("AI 回复:", r2.slice(0, 300))
      expect(r2.length).toBeGreaterThan(30)

      // 第3轮：要求完整方案
      console.log("\n=== 第3轮: 要求完整方案 ===")
      const r3 = await chat(sid, "请给我一个完整的、健壮的版本，处理所有边界情况")
      console.log("AI 回复:", r3.slice(0, 300))
      expect(r3.length).toBeGreaterThan(50)

      // 第4轮：要求测试
      console.log("\n=== 第4轮: 要求写测试 ===")
      const r4 = await chat(sid, "写几个测试用例验证这个函数的正确性")
      console.log("AI 回复:", r4.slice(0, 300))
      expect(r4.length).toBeGreaterThan(50)

      console.log("\n=== Bug 调试流程完成 ===")
    },
    TIMEOUT * 2,
  )
})

describe("E2E: 多轮对话 - 代码审查", () => {
  testFn(
    "代码审查流程",
    async () => {
      const session = await client.session.create({ title: "代码审查" })
      const sid = session.data!.id

      // 第1轮：提交代码审查
      console.log("\n=== 第1轮: 提交代码审查 ===")
      const r1 = await chat(
        sid,
        `帮我审查这段代码：
\`\`\`python
def process_data(data):
    result = []
    for i in range(len(data)):
        if data[i] > 0:
            result.append(data[i] * 2)
    return result
\`\`\`
有什么可以改进的？`,
      )
      console.log("AI 建议:", r1.slice(0, 400))
      expect(r1.length).toBeGreaterThan(50)

      // 第2轮：要求重构
      console.log("\n=== 第2轮: 要求重构 ===")
      const r2 = await chat(sid, "请按照你的建议重构这段代码")
      console.log("AI 重构:", r2.slice(0, 400))
      expect(r2.length).toBeGreaterThan(50)

      // 第3轮：性能问题
      console.log("\n=== 第3轮: 询问性能 ===")
      const r3 = await chat(sid, "如果数据量很大（百万级），有什么性能优化建议？")
      console.log("AI 建议:", r3.slice(0, 400))
      expect(r3.length).toBeGreaterThan(50)

      console.log("\n=== 代码审查流程完成 ===")
    },
    TIMEOUT * 2,
  )
})
