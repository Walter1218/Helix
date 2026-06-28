#!/usr/bin/env bun --conditions=browser
/**
 * Helix TUI PTY Inspector
 *
 * 使用 node-pty 捕获 TUI 输出并分析。
 */

import { createOpencodeClient } from "@mimo-ai/sdk/v2"
import { resolve } from "path"

const PORT = 3104
const SERVER_URL = `http://localhost:${PORT}`
const MIMOCODE_HOME = process.env.HOME + "/.config/mimocode"
const HELIX_DIR = resolve(import.meta.dir)
const OPENCODE_DIR = resolve(HELIX_DIR, "../opencode")

function parseANSIToText(raw: string): string {
  const lines: string[][] = [[]]
  let r = 0, c = 0

  for (let i = 0; i < raw.length; i++) {
    // Skip OSC sequences
    if (raw[i] === "\x1b" && raw[i + 1] === "]") {
      const bell = raw.indexOf("\x07", i)
      if (bell > i) { i = bell; continue }
      const st = raw.indexOf("\x1b\\", i)
      if (st > i) { i = st + 1; continue }
      break
    }
    // Handle CSI sequences
    if (raw[i] === "\x1b" && raw[i + 1] === "[") {
      let cmdIdx = i + 2
      if (cmdIdx < raw.length && "?>!$\"' ".includes(raw[cmdIdx])) cmdIdx++
      while (cmdIdx < raw.length && /[0-9;]/.test(raw[cmdIdx])) cmdIdx++
      const cmd = raw[cmdIdx]

      if (cmd === "H" || cmd === "f") {
        const parts = raw.slice(i + 2, cmdIdx).split(";").map(Number)
        r = (parts[0] || 1) - 1
        c = (parts[1] || 1) - 1
        i = cmdIdx; continue
      }
      if (cmd === "J") {
        // Clear screen
        i = cmdIdx; continue
      }
      i = cmdIdx; continue
    }
    if (raw[i] === "\n") { r++; c = 0; i++; continue }
    if (raw[i] === "\r") { c = 0; i++; continue }
    if (raw[i] >= " ") {
      while (lines.length <= r) lines.push([])
      while (lines[r].length <= c) lines[r].push(" ")
      lines[r][c] = raw[i]
      c++
      continue
    }
    i++
  }

  return lines.map((l) => l.join("").trimEnd()).join("\n")
}

async function main() {
  console.log("=== Helix TUI PTY Inspector ===\n")

  // 1. Start server
  console.log("[1/4] Starting server...")
  const server = Bun.spawn(
    ["bun", "--conditions=browser", resolve(OPENCODE_DIR, "src/index.ts"), "serve", "--port", String(PORT)],
    { env: { ...process.env, MIMOCODE_HOME, MIMOCODE_LOG_LEVEL: "ERROR" }, stdout: "ignore", stderr: "ignore" }
  )
  await Bun.sleep(4000)
  try {
    const health = await fetch(`${SERVER_URL}/api/health`)
    if (!health.ok) throw new Error("health check failed")
    console.log("   ✓ Server running")
  } catch {
    server.kill()
    console.error("   ✗ Server failed")
    process.exit(1)
  }

  // 2. Create session with chat
  console.log("\n[2/4] Creating chat session...")
  const client = createOpencodeClient({ baseUrl: SERVER_URL })
  const s = await client.session.create({ title: "PTY Inspection" })
  const sid = s.data!.id
  console.log(`   ✓ Session: ${sid.slice(0, 12)}`)

  console.log("   Sending test message...")
  const r1 = await client.session.prompt({
    sessionID: sid,
    parts: [{ type: "text", text: "Reply with exactly: HELIX_TEST_OK" }],
  })
  const txt = r1.data?.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") ?? ""
  console.log(`   ✓ Response: ${txt.slice(0, 60)}`)

  // 3. Capture TUI via node-pty
  console.log("\n[3/4] Capturing TUI via PTY...")

  const ptyModule = await import("@lydell/node-pty")
  const pty = ptyModule.spawn("bun", ["--conditions=browser", resolve(HELIX_DIR, "src/index.ts")], {
    name: "xterm-256color",
    cols: 120,
    rows: 35,
    env: {
      ...process.env,
      MIMOCODE_HOME,
      MIMOCODE_LOG_LEVEL: "ERROR",
      HELIX_URL: SERVER_URL,
      HELIX_CONTINUE: "1",
    } as any,
  })

  let output = ""
  pty.onData((data: string) => { output += data })

  // Wait for TUI to render
  await new Promise((r) => setTimeout(r, 8000))

  pty.kill()
  await new Promise((r) => setTimeout(r, 500))

  console.log(`   ✓ Captured ${(output.length / 1024).toFixed(1)}KB`)

  // 4. Analyze
  console.log("\n[4/4] Analyzing TUI...\n")

  const text = parseANSIToText(output)

  console.log("─── TUI Frame (35×120) ───")
  const displayLines = text.split("\n").slice(0, 35)
  console.log(displayLines.join("\n"))
  console.log("──────────────────────────\n")

  // Analysis
  console.log("─── UI Analysis ───")
  const checks = [
    { name: "Logo/Title", patterns: ["Helix", "HELIX", "╲", "MiMo"] },
    { name: "Chat content", patterns: ["HELIX_TEST_OK", "Reply", "test"] },
    { name: "Agent mode", patterns: ["Ask", "Build"] },
    { name: "Model info", patterns: ["model", "MiMo", "mimo", "claude"] },
    { name: "Prompt area", patterns: ["Type", "Ask", ">"] },
    { name: "Keyboard hints", patterns: ["Tab", "Enter", "Ctrl", "Esc"] },
    { name: "Session info", patterns: ["session", "Session"] },
    { name: "Context/tokens", patterns: ["token", "context"] },
    { name: "Navigation", patterns: ["project", "evolution"] },
    { name: "Version info", patterns: ["v0.", "v1.", "version"] },
  ]

  for (const check of checks) {
    const found = check.patterns.some((p) => text.toLowerCase().includes(p.toLowerCase()))
    console.log(`  ${found ? "✓" : "✗"} ${check.name}`)
  }

  // Cleanup
  server.kill()
  console.log("\n=== Done ===")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
