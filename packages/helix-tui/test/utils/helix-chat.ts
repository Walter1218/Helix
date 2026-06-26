import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"

const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })

interface ChatSession {
  id: string
  title: string
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: number }>
}

const sessions = new Map<string, ChatSession>()

export async function createSession(title: string): Promise<string> {
  const result = await client.session.create({ title })
  const id = result.data!.id
  sessions.set(id, { id, title, messages: [] })
  return id
}

export async function sendMessage(sessionID: string, message: string): Promise<string> {
  const session = sessions.get(sessionID)
  if (!session) throw new Error(`Session ${sessionID} not found`)

  session.messages.push({ role: "user", content: message, timestamp: Date.now() })

  const result = await client.session.prompt({
    sessionID,
    parts: [{ type: "text", text: message }],
  })

  const response = result.data!.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text || p.content)
    .join("")

  session.messages.push({ role: "assistant", content: response, timestamp: Date.now() })

  return response
}

export async function getSessionHistory(sessionID: string): Promise<ChatSession["messages"]> {
  const session = sessions.get(sessionID)
  if (!session) throw new Error(`Session ${sessionID} not found`)
  return session.messages
}

export async function listSessions(): Promise<ChatSession[]> {
  return Array.from(sessions.values())
}

// CLI 交互模式
async function interactiveMode() {
  console.log("=== Helix TUI 交互式验收工具 ===")
  console.log("命令:")
  console.log("  new <title>  - 创建新 session")
  console.log("  list         - 列出所有 session")
  console.log("  switch <id>  - 切换到指定 session")
  console.log("  history      - 显示当前 session 历史")
  console.log("  quit         - 退出")
  console.log("  其他内容      - 发送给 Helix TUI")
  console.log("")

  let currentSession: string | null = null

  const readline = await import("readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = () => {
    const prefix = currentSession ? `[${currentSession.slice(0, 8)}]` : "[no session]"
    rl.question(`${prefix} > `, async (input) => {
      const trimmed = input.trim()
      if (!trimmed) {
        prompt()
        return
      }

      if (trimmed === "quit" || trimmed === "exit") {
        rl.close()
        process.exit(0)
      }

      if (trimmed === "list") {
        const sess = await listSessions()
        console.log("\nSessions:")
        for (const s of sess) {
          console.log(`  ${s.id} - ${s.title} (${s.messages.length} messages)`)
        }
        console.log("")
        prompt()
        return
      }

      if (trimmed === "history" && currentSession) {
        const history = await getSessionHistory(currentSession)
        console.log("\nHistory:")
        for (const msg of history) {
          const role = msg.role === "user" ? "You" : "Helix"
          console.log(`  ${role}: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? "..." : ""}`)
        }
        console.log("")
        prompt()
        return
      }

      if (trimmed.startsWith("new ")) {
        const title = trimmed.slice(4)
        currentSession = await createSession(title)
        console.log(`Created session: ${currentSession}\n`)
        prompt()
        return
      }

      if (trimmed.startsWith("switch ")) {
        const id = trimmed.slice(7)
        if (sessions.has(id)) {
          currentSession = id
          console.log(`Switched to session: ${id}\n`)
        } else {
          console.log(`Session ${id} not found\n`)
        }
        prompt()
        return
      }

      if (!currentSession) {
        console.log("Please create or switch to a session first\n")
        prompt()
        return
      }

      try {
        console.log("\nHelix TUI 正在思考...")
        const response = await sendMessage(currentSession, trimmed)
        console.log(`\nHelix TUI:\n${response}\n`)
      } catch (e: any) {
        console.error(`Error: ${e.message}\n`)
      }

      prompt()
    })
  }

  prompt()
}

// 如果直接运行则进入交互模式
if (import.meta.main) {
  interactiveMode()
}
