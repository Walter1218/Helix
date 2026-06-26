#!/usr/bin/env bun --conditions=browser
/**
 * Helix CLI — 通过 HTTP API 与 Helix Server 通讯的命令行工具。
 *
 * 用法:
 *   bun run helix-cli.ts chat "your message"    # 发送消息
 *   bun run helix-cli.ts sessions                # 列出 sessions
 *   bun run helix-cli.ts health                  # 健康检查
 *   bun run helix-cli.ts events                  # 监听 Helix 事件流
 *   bun run helix-cli.ts serve [port]            # 启动 Helix Server
 *
 * 环境变量:
 *   HELIX_URL — Helix Server 地址 (默认 http://localhost:3095)
 */

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"

async function health() {
  const res = await fetch(`${SERVER_URL}/api/health`)
  const json = await res.json().catch(() => ({ error: res.statusText }))
  console.log(JSON.stringify(json, null, 2))
}

async function sessions() {
  const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: SERVER_URL })
  const result = await client.session.list()
  if (result.error) {
    console.error("Error:", result.error)
    return
  }
  const list = result.data ?? []
  console.log(JSON.stringify(list.map((s: any) => ({
    id: s.id,
    title: s.title,
    updated: s.time?.updated ? new Date(s.time.updated).toISOString() : "unknown",
  })), null, 2))
}

async function chat(message: string) {
  const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: SERVER_URL })

  // Create session
  const session = await client.session.create({ title: message.slice(0, 50) })
  if (session.error) {
    console.error("Failed to create session:", session.error)
    return
  }
  const sid = session.data!.id
  console.log(`Session: ${sid}`)

  // Send prompt
  const response = await client.session.prompt({
    sessionID: sid,
    parts: [{ type: "text", text: message }],
  })
  if (response.error) {
    console.error("Prompt error:", response.error)
    return
  }

  const text = response.data?.parts
    ?.filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("") ?? ""

  console.log(text)
}

async function events() {
  const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: SERVER_URL })

  const stream = await client.global.event({ sseMaxRetryAttempts: 0 })
  console.log("Listening for Helix events...")
  for await (const event of stream.stream) {
    const evt = event as any
    const type = evt.type ?? evt.properties?.type ?? "unknown"
    // Only show Helix-specific events
    if (type && /judge|cardinal|alignment|preflight|mode|candidate/i.test(type)) {
      console.log(`[${new Date().toISOString()}] ${type}:`, JSON.stringify(evt.properties ?? evt).slice(0, 300))
    }
  }
}

async function serve(port?: string) {
  const p = port ? parseInt(port) : 3095
  console.log(`Starting Helix Server on port ${p}...`)
  // Import and run the server from opencode
  process.env.OPENCODE_PORT = String(p)
  const { Server } = await import("../opencode/src/server/server")
  await Server.Default().listen({ port: p, hostname: "127.0.0.1" })
  console.log(`Server running at http://127.0.0.1:${p}`)
}

// Main
const cmd = process.argv[2]
const arg = process.argv[3]

switch (cmd) {
  case "health":
    await health()
    break
  case "sessions":
    await sessions()
    break
  case "chat":
    if (!arg) {
      console.error("Usage: bun run helix-cli.ts chat \"your message\"")
      process.exit(1)
    }
    await chat(arg)
    break
  case "events":
    await events()
    break
  case "serve":
    await serve(arg)
    break
  default:
    console.log("Helix CLI — communication tool for Helix AI Server")
    console.log("")
    console.log("Commands:")
    console.log("  health              Check server health")
    console.log("  sessions            List active sessions")
    console.log("  chat <message>      Send a message and get response")
    console.log("  events              Stream Helix events (judge/cardinal/alignment)")
    console.log("  serve [port]        Start Helix Server")
    console.log("")
    console.log(`Server URL: ${SERVER_URL}`)
}
