import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"

const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })

export async function createChatSession(title: string): Promise<{ id: string; title: string }> {
  const result = await client.session.create({ title })
  return { id: result.data!.id, title: result.data!.title }
}

export async function chat(sessionID: string, message: string, agent?: string): Promise<string> {
  const result = await client.session.prompt({
    sessionID,
    parts: [{ type: "text", text: message }],
    agent,
  })

  return result.data!.parts
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text || p.content)
    .join("")
}

export async function getChatMessages(sessionID: string): Promise<Array<{ role: string; content: string }>> {
  const result = await client.session.messages({ sessionID, limit: 100 })
  return (result.data ?? []).map((m: any) => ({
    role: m.info.role,
    content: m.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || p.content)
      .join(""),
  }))
}

export async function listChatSessions(): Promise<Array<{ id: string; title: string }>> {
  const result = await client.session.list({ limit: 50 })
  return (result.data ?? []).map((s: any) => ({ id: s.id, title: s.title }))
}

export async function deleteSession(sessionID: string): Promise<boolean> {
  try {
    await client.session.delete({ sessionID })
    return true
  } catch {
    return false
  }
}

export async function renameSession(sessionID: string, title: string): Promise<boolean> {
  try {
    await client.session.update({ sessionID, title })
    return true
  } catch {
    return false
  }
}

export async function listAgents(): Promise<Array<{ name: string; description: string; mode: string }>> {
  const result = await client.app.agents()
  return (result.data ?? []).map((a: any) => ({
    name: a.name,
    description: a.description,
    mode: a.mode,
  }))
}

export async function getSessionStatus(): Promise<Record<string, string>> {
  const result = await client.session.status()
  return (result.data ?? {}) as Record<string, string>
}

// CLI
if (import.meta.main) {
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case "create": {
      const title = args.slice(1).join(" ") || "Test Session"
      const session = await createChatSession(title)
      console.log(JSON.stringify(session))
      break
    }

    case "chat": {
      const sessionID = args[1]
      const agent = args[2] === "--agent" ? args[3] : undefined
      const msgStart = agent ? 4 : 2
      const message = args.slice(msgStart).join(" ")
      if (!sessionID || !message) {
        console.error("Usage: helix-chat-cli.ts chat <sessionID> [--agent <name>] <message>")
        process.exit(1)
      }
      const response = await chat(sessionID, message, agent)
      console.log(response)
      break
    }

    case "messages": {
      const sessionID = args[1]
      if (!sessionID) {
        console.error("Usage: helix-chat-cli.ts messages <sessionID>")
        process.exit(1)
      }
      const messages = await getChatMessages(sessionID)
      for (const msg of messages) {
        console.log(`[${msg.role}]: ${msg.content.slice(0, 500)}${msg.content.length > 500 ? "..." : ""}`)
      }
      break
    }

    case "list": {
      const sessions = await listChatSessions()
      console.log(JSON.stringify(sessions, null, 2))
      break
    }

    case "delete": {
      const sessionID = args[1]
      if (!sessionID) {
        console.error("Usage: helix-chat-cli.ts delete <sessionID>")
        process.exit(1)
      }
      const result = await deleteSession(sessionID)
      console.log(JSON.stringify({ deleted: result, sessionID }))
      break
    }

    case "rename": {
      const sessionID = args[1]
      const title = args.slice(2).join(" ")
      if (!sessionID || !title) {
        console.error("Usage: helix-chat-cli.ts rename <sessionID> <new title>")
        process.exit(1)
      }
      const result = await renameSession(sessionID, title)
      console.log(JSON.stringify({ renamed: result, sessionID, title }))
      break
    }

    case "agents": {
      const agents = await listAgents()
      console.log(JSON.stringify(agents, null, 2))
      break
    }

    case "status": {
      const status = await getSessionStatus()
      console.log(JSON.stringify(status, null, 2))
      break
    }

    default:
      console.log("Helix TUI Chat CLI")
      console.log("")
      console.log("Commands:")
      console.log("  create <title>                    - Create a new chat session")
      console.log("  chat <id> [--agent <name>] <msg>  - Send a message (optionally with agent)")
      console.log("  messages <id>                     - Get all messages in a session")
      console.log("  list                              - List recent sessions")
      console.log("  delete <id>                       - Delete a session")
      console.log("  rename <id> <title>               - Rename a session")
      console.log("  agents                            - List available agents")
      console.log("  status                            - Get session statuses")
  }
}
