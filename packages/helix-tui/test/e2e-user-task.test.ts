import { describe, test, expect, beforeAll, afterAll } from "bun:test"
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

describe("E2E: 用户任务模拟 - 文件操作全流程", () => {
  let sessionID: string

  beforeAll(async () => {
    if (!serverReachable) return
    const session = await client.session.create({ title: "E2E 文件操作测试" })
    sessionID = session.data!.id
  })

  testFn(
    "第1轮: 让 AI 创建文件",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [{ type: "text", text: 'Create a file called hello.py with content: print("Hello, World!")' }],
      })

      expect(result.data).toBeDefined()
      expect(result.data!.parts.length).toBeGreaterThan(0)

      const textContent = result.data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content)
        .join("")

      expect(textContent.length).toBeGreaterThan(0)
      console.log("File creation task completed, response length:", textContent.length)
    },
    TIMEOUT,
  )

  testFn(
    "第2轮: 验证文件被创建",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [{ type: "text", text: "Read the file hello.py and tell me its content" }],
      })

      expect(result.data).toBeDefined()
      const textContent = result.data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content)
        .join("")

      expect(textContent).toContain("Hello")
      console.log("AI response includes file content")
    },
    TIMEOUT,
  )

  testFn(
    "第3轮: 修改文件",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [
          {
            type: "text",
            text: 'Edit hello.py to change "Hello, World!" to "Hello, Helix!" and then read it back to verify',
          },
        ],
      })

      expect(result.data).toBeDefined()
      const textContent = result.data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content)
        .join("")

      expect(textContent).toContain("Helix")
      console.log("AI successfully edited and verified file")
    },
    TIMEOUT,
  )

  testFn(
    "第4轮: 删除文件",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [{ type: "text", text: "Delete hello.py if it exists" }],
      })

      expect(result.data).toBeDefined()
      expect(result.data!.parts.length).toBeGreaterThan(0)
      console.log("File deletion task completed")
    },
    TIMEOUT,
  )
})

describe("E2E: 用户任务模拟 - 代码分析", () => {
  let sessionID: string

  beforeAll(async () => {
    if (!serverReachable) return
    const session = await client.session.create({ title: "E2E 代码分析测试" })
    sessionID = session.data!.id
  })

  testFn(
    "第1轮: 分析项目结构",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [{ type: "text", text: "List the files in the current directory and tell me what kind of project this is" }],
      })

      expect(result.data).toBeDefined()
      const textContent = result.data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content)
        .join("")

      expect(textContent.length).toBeGreaterThan(0)
      console.log("Project analysis completed, response length:", textContent.length)
    },
    TIMEOUT,
  )

  testFn(
    "第2轮: 搜索特定文件",
    async () => {
      const result = await client.session.prompt({
        sessionID,
        parts: [{ type: "text", text: "Find all TypeScript files in the src directory" }],
      })

      expect(result.data).toBeDefined()
      const textContent = result.data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content)
        .join("")

      expect(textContent.length).toBeGreaterThan(0)
      console.log("File search completed, response length:", textContent.length)
    },
    TIMEOUT,
  )
})

describe("E2E: Session 管理", () => {
  testFn("创建多个 session", async () => {
    const sessions = await Promise.all([
      client.session.create({ title: "Session 1" }),
      client.session.create({ title: "Session 2" }),
      client.session.create({ title: "Session 3" }),
    ])

    for (const s of sessions) {
      expect(s.data).toBeDefined()
      expect(s.data!.id).toBeTruthy()
    }

    const list = await client.session.list()
    expect(list.data!.length).toBeGreaterThanOrEqual(3)
    console.log(`Created ${sessions.length} sessions, total: ${list.data!.length}`)
  })

  testFn("Session 状态查询", async () => {
    const session = await client.session.create({ title: "Status Test" })
    const status = await client.session.status()
    expect(status.data).toBeDefined()
    console.log("Session status retrieved")
  })
})
