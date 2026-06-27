#!/usr/bin/env bun
/**
 * Helix TUI — 录屏 + 解析一体工具
 *
 * 用法: bun run record.ts
 *
 * 启动 TUI → 录制终端操作 → Ctrl+C 退出 → 自动解析重建布局
 */

import { spawn } from "child_process"
import { readFileSync, existsSync, unlinkSync } from "fs"

const RECORD_FILE = `/tmp/helix-record-${Date.now()}.ans`

console.log("🧬 Helix TUI Recorder")
console.log(`   Output: ${RECORD_FILE}`)
console.log("   Use TUI normally, then Ctrl+C to stop")
console.log("")

// Run TUI via `script` to capture all terminal output
const script = spawn("script", ["-q", RECORD_FILE, "bash", "-c",
  `cd '${import.meta.dir}' && mkdir -p .dev-home/data && MIMOCODE_HOME=$PWD/.dev-home MIMOCODE_LOG_LEVEL=ERROR bun run --conditions=browser src/index.ts`
], { stdio: "inherit" })

await new Promise<void>((resolve) => {
  script.on("exit", () => resolve())
})

console.log("")
console.log("Recording stopped. Analyzing...")

if (!existsSync(RECORD_FILE)) {
  console.log("No recording found.")
  process.exit(1)
}

const data = readFileSync(RECORD_FILE, "utf-8")

// Parse ANSI — find last complete frame and rebuild grid
const grid = new Map<string, string>()
let row = 1, col = 1, maxCol = 0

for (let i = 0; i < data.length; i++) {
  if (data[i] === "\x1b" && data[i + 1] === "[") {
    // Cursor position: CSI row;colH
    const hEnd = data.indexOf("H", i)
    if (hEnd > i && /^\d+(;\d+)*$/.test(data.slice(i + 2, hEnd))) {
      const [r, c] = data.slice(i + 2, hEnd).split(";").map(Number)
      if (r) row = r
      if (c) col = c
      i = hEnd
      continue
    }
    // SGR / other CSI
    if (data[i + 2] === "m" || (data[i + 2] >= "0" && data[i + 2] <= "9" && data.indexOf("m", i + 2) > i)) {
      i = data.indexOf("m", i)
      continue
    }
    while (i < data.length - 1 && !";HhmJABCDEFGHfn".includes(data[i + 1])) i++
    continue
  }
  if (data[i] === "\n") { row++; col = 1; i++; continue }
  if (data[i] === "\r") { col = 1; i++; continue }
  if (data[i] === "\b") { col = Math.max(1, col - 1); i++; continue }
  // Printable
  if (data[i] >= " ") {
    grid.set(`${row},${col}`, data[i])
    if (col > maxCol) maxCol = col
    col++
    i++
    continue
  }
  i++
}

console.log(`\nMax column: ${maxCol} ${maxCol > 79 ? "⚠ OVERFLOW" : "✓ OK"}`)
console.log("")

// Show final frame
for (let r = 1; r <= 24; r++) {
  let line = ""
  let has = false
  for (let c = 1; c <= 80; c++) {
    const ch = grid.get(`${r},${c}`) || " "
    line += ch
    if (ch !== " ") has = true
  }
  if (has) console.log(`${String(r).padStart(2)}│${line}│`)
}

// Show overflow
const overflow: string[] = []
for (let r = 1; r <= 24; r++) {
  let s = ""
  for (let c = 79; c <= maxCol; c++) {
    s += grid.get(`${r},${c}`) || "·"
  }
  if (s.trim().replace(/·/g, "")) overflow.push(`R${r}[79-${maxCol}]: ${s}`)
}
if (overflow.length) {
  console.log(`\n⚠ Overflow (cols 79-${maxCol}):`)
  overflow.forEach(l => console.log("  " + l))
}

// Clean up
try { unlinkSync(RECORD_FILE) } catch {}
console.log(`\nDone.`)
