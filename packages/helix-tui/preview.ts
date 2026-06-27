#!/usr/bin/env bun
/**
 * Helix TUI Preview — 把 ANSI 输出渲染为 HTML，方便在浏览器里查看真实 UI
 *
 * 用法:
 *   bun run preview.ts                    # 启动 TUI, 捕获 → 渲染 HTML → 打开浏览器
 *   bun run preview.ts capture.ans        # 解析已有 ANSI 文件 → HTML
 */

import { $ } from "bun"
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs"
import { resolve } from "path"

const HELIX_DIR = import.meta.dir
const OUT_HTML = "/tmp/helix-preview.html"
let ANS_FILE = process.argv[2]

// ── Step 1: Capture ─────────────────────────────────────────
if (!ANS_FILE || !existsSync(ANS_FILE)) {
  ANS_FILE = "/tmp/helix-preview-capture.ans"
  console.log("🎬 Capturing TUI output... (5 seconds)")
  console.log("   Use TUI normally, then the script auto-captures")
  console.log("")

  const proc = Bun.spawn(["bash", "-c",
    `cd "${HELIX_DIR}" && mkdir -p $HOME/.config/mimocode/config && [ ! -f $HOME/.config/mimocode/config/mimocode.json ] && cp $HOME/.config/mimocode/mimocode.json $HOME/.config/mimocode/config/mimocode.json 2>/dev/null; MIMOCODE_HOME=$HOME/.config/mimocode MIMOCODE_LOG_LEVEL=ERROR bun --conditions=browser src/index.ts > "${ANS_FILE}" 2>/dev/null`
  ], { stdout: "ignore", stderr: "ignore" })

  await Bun.sleep(5000)
  proc.kill()
  await Bun.sleep(500)
  console.log(`   Captured: ${(existsSync(ANS_FILE) ? readFileSync(ANS_FILE).length : 0)} bytes`)
}

if (!existsSync(ANS_FILE)) {
  console.error("No capture file found!")
  process.exit(1)
}

// ── Step 2: Parse ANSI → Grid ──────────────────────────────
const data = readFileSync(ANS_FILE, "utf-8")

type Cell = { ch: string; fg?: string; bg?: string; bold?: boolean }
const grid: Record<string, Cell> = {}
let row = 1, col = 1
let currentFg = "#ffffff", currentBg = "#000000", currentBold = false
const defaultFg = "#cccccc", defaultBg = "#0a0a1a"

function setCell(r: number, c: number, cell: Cell) {
  grid[`${r},${c}`] = cell
}

for (let i = 0; i < data.length; i++) {
  // OSC sequences
  if (data[i] === "\x1b" && data[i + 1] === "]") {
    const bell = data.indexOf("\x07", i)
    if (bell > i) { i = bell; continue }
    const st = data.indexOf("\x1b\\", i)
    if (st > i) { i = st + 1; continue }
    break
  }
  // CSI sequences
  if (data[i] === "\x1b" && data[i + 1] === "[") {
    const end = data.indexOf("m", i)
    // SGR (color)
    if (end > i && /^\[\d+(;\d+)*$/.test(data.slice(i, end + 1).replace("m", ""))) {
      const codes = data.slice(i + 2, end).split(";").map(Number)
      for (let j = 0; j < codes.length; j++) {
        const c = codes[j]
        if (c === 0) { currentFg = defaultFg; currentBg = defaultBg; currentBold = false }
        else if (c === 1) currentBold = true
        else if (c === 22) currentBold = false
        else if (c >= 30 && c <= 37) {
          const colors = ["#000000","#cc0000","#00cc00","#cccc00","#0000cc","#cc00cc","#00cccc","#cccccc"]
          currentFg = colors[c - 30]
        }
        else if (c === 38 && codes[j + 1] === 2) {
          currentFg = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`
          j += 4
        }
        else if (c === 39) currentFg = defaultFg
        else if (c >= 40 && c <= 47) {
          const colors = ["#000000","#cc0000","#00cc00","#cccc00","#0000cc","#cc00cc","#00cccc","#cccccc"]
          currentBg = colors[c - 40]
        }
        else if (c === 48 && codes[j + 1] === 2) {
          currentBg = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`
          j += 4
        }
        else if (c === 49) currentBg = defaultBg
        else if (c === 38 && codes[j + 1] === 5) j += 2
        else if (c === 48 && codes[j + 1] === 5) j += 2
      }
      i = end
      continue
    }
    // Cursor position: CSI row;colH
    const hEnd = data.indexOf("H", i)
    if (hEnd > i && /^\d+(;\d+)*$/.test(data.slice(i + 2, hEnd))) {
      const parts = data.slice(i + 2, hEnd).split(";").map(Number)
      if (parts[0]) row = parts[0]
      if (parts[1]) col = parts[1]
      i = hEnd
      continue
    }
    // Skip other CSI
    while (i < data.length - 1 && !";HhmJABCDEFGHfn".includes(data[i + 1])) i++
    continue
  }
  // Printable
  if (data[i] === "\n") { row++; col = 1; i++; continue }
  if (data[i] === "\r") { col = 1; i++; continue }
  if (data[i] >= " ") {
    setCell(row, col, { ch: data[i], fg: currentFg, bg: currentBg, bold: currentBold })
    col++
    continue
  }
  i++
}

// ── Step 3: Render HTML ─────────────────────────────────────
const maxRow = Math.max(1, ...Object.keys(grid).map(k => parseInt(k.split(",")[0])))
const maxCol = Math.max(1, ...Object.keys(grid).map(k => parseInt(k.split(",")[1])))

let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Helix TUI Preview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#ccc;font-family:"SF Mono","Menlo","Monaco","Courier New",monospace;font-size:14px;line-height:1.3;padding:20px}
.grid{display:grid;grid-template-columns:repeat(${maxCol},1ch);grid-template-rows:repeat(${maxRow},1.3em);gap:0;width:fit-content}
.cell{width:1ch;height:1.3em;overflow:hidden;white-space:pre;text-align:center}
.header{margin-bottom:16px;color:#666;font-size:12px}
.header b{color:#00ffcc}
.info{margin-top:8px;color:#555;font-size:11px}
</style></head><body>
<div class="header"><b>Helix TUI Preview</b> — ${maxRow}×${maxCol} grid</div>
<div class="grid">
`

for (let r = 1; r <= maxRow; r++) {
  for (let c = 1; c <= maxCol; c++) {
    const cell = grid[`${r},${c}`]
    if (!cell) {
      html += `<div class="cell"></div>`
      continue
    }
    const ch = cell.ch === " " ? "&nbsp;" : cell.ch === "<" ? "&lt;" : cell.ch === ">" ? "&gt;" : cell.ch === "&" ? "&amp;" : cell.ch
    const fg = cell.fg || defaultFg
    const bg = cell.bg || defaultBg
    html += `<div class="cell" style="color:${fg};background:${bg};${cell.bold ? "font-weight:bold" : ""}">${ch}</div>`
  }
}

html += `</div><div class="info">Max ${maxCol} cols | ${maxRow} rows | ${Object.keys(grid).length} cells</div></body></html>`

writeFileSync(OUT_HTML, html)
console.log(`\n✅ Preview saved: ${OUT_HTML}`)
console.log(`   Grid: ${maxRow} rows × ${maxCol} cols, ${Object.keys(grid).length} non-empty cells`)

// Try to open in browser
try {
  await $`open ${OUT_HTML}`.quiet()
  console.log("   Opened in browser")
} catch {
  console.log(`   Open manually: file://${OUT_HTML}`)
}
