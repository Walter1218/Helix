#!/usr/bin/env bun --conditions=browser
/**
 * Helix MCP Server — 通过标准 MCP 协议暴露 Helix AI 能力。
 *
 * 注册到 opencode:
 *   在 mimocode.json 中添加:
 *   "mcp": {
 *     "helix": {
 *       "type": "local",
 *       "command": ["bun", "run", "packages/helix-tui/test/utils/helix-mcp-server.ts"]
 *     }
 *   }
 *
 * 或手动启动:
 *   HELIX_URL=http://localhost:3095 bun run helix-mcp-server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const HELIX_URL = process.env.HELIX_URL ?? "http://localhost:3095"
let sdk: any = null

async function getSDK() {
  if (!sdk) {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    sdk = createOpencodeClient({ baseUrl: HELIX_URL })
  }
  return sdk
}

const server = new McpServer({
  name: "helix-mcp",
  version: "0.1.0",
})

// Tool: 健康检查
server.tool("helix_health", "Check Helix Server health status", {}, async () => {
  try {
    const res = await fetch(`${HELIX_URL}/api/health`)
    const body = await res.json()
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] }
  } catch (e) {
    return { content: [{ type: "text", text: `Helix Server unreachable at ${HELIX_URL}: ${e}` }], isError: true }
  }
})

// Tool: 列出 sessions
server.tool("helix_list_sessions", "List all active Helix sessions", {}, async () => {
  const client = await getSDK()
  const result = await client.session.list()
  if (result.error) {
    return { content: [{ type: "text", text: `Error: ${JSON.stringify(result.error)}` }], isError: true }
  }
  const sessions = (result.data ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    updated: s.time?.updated ? new Date(s.time.updated).toISOString() : null,
  }))
  return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] }
})

// Tool: 创建 session 并发送消息
server.tool(
  "helix_chat",
  "Send a message to Helix AI and get the response. Creates a new session if no sessionID provided.",
  {
    message: z.string().describe("The message to send"),
    sessionID: z.string().optional().describe("Existing session ID to continue conversation"),
    mode: z.enum(["ask", "build", "plan"]).optional().default("ask").describe("Agent mode"),
  },
  async ({ message, sessionID, mode }) => {
    const client = await getSDK()

    let sid = sessionID
    if (!sid) {
      const session = await client.session.create({ title: message.slice(0, 50) })
      if (session.error) {
        return { content: [{ type: "text", text: `Failed to create session: ${JSON.stringify(session.error)}` }], isError: true }
      }
      sid = session.data!.id
    }

    const response = await client.session.prompt({
      sessionID: sid,
      mode,
      parts: [{ type: "text", text: message }],
    })

    if (response.error) {
      return { content: [{ type: "text", text: `Prompt error: ${JSON.stringify(response.error)}` }], isError: true }
    }

    const text = response.data?.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("") ?? ""

    return {
      content: [{ type: "text", text: JSON.stringify({ sessionID: sid, mode, response: text }, null, 2) }],
    }
  },
)

// Tool: 读取 AGENTS.md
server.tool(
  "helix_read_rules",
  "Read the project AGENTS.md rules file",
  {
    directory: z.string().describe("Project directory path"),
  },
  async ({ directory }) => {
    const fs = await import("fs")
    const path = await import("path")
    try {
      const content = fs.readFileSync(path.join(directory, "AGENTS.md"), "utf-8")
      return { content: [{ type: "text", text: content.slice(0, 8000) }] }
    } catch {
      return { content: [{ type: "text", text: "AGENTS.md not found or unreadable" }], isError: true }
    }
  },
)

// Tool: 写 AGENTS.md
server.tool(
  "helix_write_rule",
  "Append a rule to the project AGENTS.md file",
  {
    directory: z.string().describe("Project directory path"),
    rule: z.string().describe("Rule to append (Markdown)"),
  },
  async ({ directory, rule }) => {
    const fs = await import("fs")
    const path = await import("path")
    const p = path.join(directory, "AGENTS.md")
    const existing = fs.readFileSync(p, "utf-8").catch(() => "") || ""
    const next = existing ? `${existing}\n\n${rule}` : `# AGENTS.md\n\n${rule}`
    fs.writeFileSync(p, next)
    return { content: [{ type: "text", text: `Rule appended to ${p}` }] }
  },
)

// Tool: 列出 Helix 内部插件注册的工具
server.tool("helix_list_internal_tools", "List Helix internal MCP tools", {}, async () => {
  try {
    // Dynamic import the internal MCP tools registry
    const helixMcp = await import("../../opencode/src/mcp/helix-mcp-server")
    const tools = helixMcp.listTools().map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    return { content: [{ type: "text", text: JSON.stringify(tools, null, 2) }] }
  } catch (e) {
    return {
      content: [{ type: "text", text: `Could not load internal tools: ${e}. Helix server may not be running.` }],
      isError: true,
    }
  }
})

// Start MCP server
const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`Helix MCP Server started, connecting to ${HELIX_URL}`)
