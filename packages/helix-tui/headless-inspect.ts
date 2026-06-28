#!/usr/bin/env bun --conditions=browser
/**
 * Helix TUI Headless Inspector
 *
 * 使用真实 server + PTY 捕获方式检测 TUI 状态。
 */

import { createOpencodeClient } from "@mimo-ai/sdk/v2"
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs"
import { resolve } from "path"

const PORT = 3103
const SERVER_URL = `http://localhost:${PORT}`
const MIMOCODE_HOME = process.env.HOME + "/.config/mimocode"
const HELIX_DIR = resolve(import.meta.dir)
const OPENCODE_DIR = resolve(HELIX_DIR, "../opencode")
const ANS_FILE = "/tmp/helix-headless-capture.ans"

function parseANSIGrid(raw: string): Map<string, string> {
  const grid = new Map<string, string>()
  let r = 1, c = 1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\x1b" && raw[i + 1] === "]") {
      const bell = raw.indexOf("\x07", i)
      if (bell > i) { i = bell; continue }
      break
    }
    if (raw[i] === "\x1b" && raw[i + 1] === "[") {
      let cmdIdx = i + 2
      if (cmdIdx < raw.length && "?>!$\"' ".includes(raw[cmdIdx])) cmdIdx++
      while (cmdIdx < raw.length && /[0-9;]/.test(raw[cmdIdx])) cmdIdx++
      const cmd = raw[cmdIdx]
      if (cmd === "H" || cmd === "f") {
        const parts = raw.slice(i + 2, cmdIdx).split(";").map(Number)
        if (parts[0]) r = parts[0]
        if (parts[1]) c = parts[1]
        i = cmdIdx; continue
      }
      i = cmdIdx; continue
    }
    if (raw[i] === "\n") { r++; c = 1; i++; continue }
    if (raw[i] === "\r") { c = 1; i++; continue }
    if (raw[i] >= " ") { grid.set(`${r},${c}`, raw[i]); c++; continue }
    i++
  }
  return grid
}

function gridToString(grid: Map<string, string>, rows = 24, cols = 80): string {
  const lines: string[] = []
  for (let r = 1; r <= rows; r++) {
    let line = ""
    for (let c = 1; c <= cols; c++) line += grid.get(`${r},${c}`) || " "
    lines.push(line.trimEnd())
  }
  return lines.join("\n")
}

async function main() {
  console.log("=== Helix TUI Headless Inspector ===\n")

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
    console.error("   ✗ Server failed to start")
    process.exit(1)
  }

  // 2. Create multi-turn session
  console.log("\n[2/4] Creating chat session...")
  const client = createOpencodeClient({ baseUrl: SERVER_URL })

  const s = await client.session.create({ title: "TUI Inspection" })
  const sid = s.data!.id
  console.log(`   ✓ Session: ${sid.slice(0, 12)}`)

  // Send a message and wait for response
  console.log("   Sending test message...")
  const r1 = await client.session.prompt({
    sessionID: sid,
    parts: [{ type: "text", text: "Reply with exactly: HELIX_TEST_OK" }],
  })
  const txt = r1.data?.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") ?? ""
  console.log(`   ✓ Response: ${txt.slice(0, 60)}`)

  // 3. Capture TUI via PTY
  console.log("\n[3/4] Capturing TUI via PTY...")
  try { unlinkSync(ANS_FILE) } catch {}

  const tuiProc = Bun.spawn(
    ["script", "-q", ANS_FILE, "bash", "-c",
      `cd "${HELIX_DIR}" && HELIX_URL=${SERVER_URL} HELIX_CONTINUE=1 MIMOCODE_HOME=${MIMOCODE_HOME} MIMOCODE_LOG_LEVEL=ERROR bun --conditions=browser src/index.ts`
    ],
    { stdout: "ignore", stderr: "ignore" }
  )
  await Bun.sleep(6000)
  tuiProc.kill()
  await Bun.sleep(500)

  if (!existsSync(ANS_FILE)) {
    console.error("   ✗ No capture file")
    server.kill()
    process.exit(1)
  }

  const raw = readFileSync(ANS_FILE, "utf-8")
  console.log(`   ✓ Captured ${(raw.length / 1024).toFixed(1)}KB`)

  // 4. Parse and analyze
  console.log("\n[4/4] Analyzing TUI layout...\n")

  // Find last frame
  let lastHomeIdx = 0
  for (let i = 3; i < raw.length - 1; i++) {
    if (raw[i] === "H" && raw[i - 2] === "[") {
      const pre = raw.slice(Math.max(0, i - 10), i + 1)
      const m = pre.match(/\x1b\[(\d+);(\d+)H$/)
      if (m) lastHomeIdx = i - m[0].length + 1
    }
  }
  const frame = raw.slice(lastHomeIdx > 0 ? lastHomeIdx : 0)

  const grid = parseANSIGrid(frame)
  const text = gridToString(grid, 35, 120)

  console.log("─── TUI Frame (35×120) ───")
  console.log(text)
  console.log("──────────────────────────\n")

  // Analysis
  console.log("─── UI Analysis ───")
  const checks = [
    { name: "Logo/Title", patterns: ["Helix", "HELIX", "╲", "MiMo"] },
    { name: "Chat area", patterns: ["HELIX_TEST_OK", "Reply", "test"] },
    { name: "Agent mode indicator", patterns: ["Ask", "Build", "agent"] },
    { name: "Model info", patterns: ["model", "MiMo", "mimo"] },
    { name: "Prompt input", patterns: ["Type", "input", ">", "Ask"] },
    { name: "Keyboard hints", patterns: ["Tab", "Enter", "Ctrl", "Esc"] },
    { name: "Session info", patterns: ["session", "Session"] },
    { name: "Context/tokens", patterns: ["token", "context", "ctx"] },
    { name: "Status bar", patterns: ["status", "Status"] },
    { name: "Navigation", patterns: ["project", "evolution", "monitor"] },
  ]

  for (const check of checks) {
    const found = check.patterns.some((p) => text.toLowerCase().includes(p.toLowerCase()))
    console.log(`  ${found ? "✓" : "✗"} ${check.name}`)
  }

  // Cleanup
  server.kill()
  try { unlinkSync(ANS_FILE) } catch {}
  console.log("\n=== Done ===")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
