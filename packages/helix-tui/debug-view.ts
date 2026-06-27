#!/usr/bin/env bun
/**
 * Helix TUI Debug Viewer — 自动捕获 session 视图并渲染为 HTML
 *
 * 用法: bun run debug-view.ts
 */

import { $ } from "bun"
import { createOpencodeClient } from "@mimo-ai/sdk/v2"
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs"
import { resolve } from "path"

const PORT = 3101, SERVER_URL = `http://localhost:${PORT}`
const MIMOCODE_HOME = process.env.HOME + "/.config/mimocode"
const HELIX_DIR = import.meta.dir, OPENCODE_DIR = resolve(HELIX_DIR, "../opencode")
const ANS_FILE = "/tmp/helix-debug.ans", HTML_FILE = "/tmp/helix-debug.html"

// Ensure config
await $`mkdir -p ${MIMOCODE_HOME}/config`.quiet()
if (!existsSync(MIMOCODE_HOME + "/config/mimocode.json") && existsSync(MIMOCODE_HOME + "/mimocode.json"))
  await $`cp ${MIMOCODE_HOME}/mimocode.json ${MIMOCODE_HOME}/config/mimocode.json`.quiet()

// 1. Server
console.log("1/4 Server...")
const server = Bun.spawn(["bun", "--conditions=browser", resolve(OPENCODE_DIR, "src/index.ts"), "serve", "--port", String(PORT)], {
  env: { ...process.env, MIMOCODE_HOME, MIMOCODE_LOG_LEVEL: "ERROR" }, stdout: "ignore", stderr: "ignore",
})
await Bun.sleep(4000)
try { await fetch(`${SERVER_URL}/api/health`) } catch { server.kill(); console.error("Server failed"); process.exit(1) }
console.log("   ✓")

// 2. Multi-turn session
console.log("2/4 Chat...")
const client = createOpencodeClient({ baseUrl: SERVER_URL })
const s = await client.session.create({ title: "Debug" })
const sid = s.data!.id
for (const text of ["Write a function fibonacci(n).", "Now add a while-loop version.", "Explain which is faster."]) {
  await client.session.prompt({ sessionID: sid, parts: [{ type: "text", text }] })
  console.log(`   ✓`)
  await Bun.sleep(1000)
}

// 3. Capture TUI
console.log("3/4 Capture...")
try { unlinkSync(ANS_FILE) } catch {}
const tui = Bun.spawn(["script", "-q", ANS_FILE, "bash", "-c",
  `cd "${HELIX_DIR}" && HELIX_URL=${SERVER_URL} HELIX_CONTINUE=1 MIMOCODE_HOME=${MIMOCODE_HOME} MIMOCODE_LOG_LEVEL=ERROR bun --conditions=browser src/index.ts`
], { stdout: "ignore", stderr: "ignore" })
await Bun.sleep(7000)
tui.kill(); await Bun.sleep(500); server.kill()
const raw = readFileSync(ANS_FILE, "utf-8")
console.log(`   ✓ ${(raw.length/1024).toFixed(1)}KB`)

// 4. Parse + Render
console.log("4/4 Render...")

// Find the last clean cursor-home to use as the start of the final frame
let lastHomeIdx = 0
for (let i = 3; i < raw.length - 1; i++) {
  if (raw[i] === "H" && raw[i - 2] === "[" && raw[i - 5] === "\x1b") {
    // CSI row;colH (e.g. \x1b[5;21H)
    const pre = raw.slice(i - 5, i + 1)
    if (/^\x1b\[\d+;\d+H$/.test(pre)) lastHomeIdx = i
  }
}
const frame = raw.slice(lastHomeIdx > 0 ? lastHomeIdx - 5 : 0)
console.log(`   frame at offset ${lastHomeIdx}, ${(frame.length/1024).toFixed(1)}KB`)

// Parse ANSI grid
const grid = new Map<string, { ch: string; fg: string; bg: string; bold: boolean }>()
let r = 1, c = 1, cf = "#ccc", cb = "#060614", bd = false
const DF = "#ccc", DB = "#060614"

function applySGR(codes: number[]) {
  for (let j = 0; j < codes.length; j++) {
    const x = codes[j]
    if (x === 0) { cf = DF; cb = DB; bd = false }
    else if (x === 1) bd = true
    else if (x === 22) bd = false
    else if (x === 39) cf = DF
    else if (x === 49) cb = DB
    else if (x === 38 && codes[j + 1] === 2) { cf = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`; j += 4 }
    else if (x === 48 && codes[j + 1] === 2) { cb = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`; j += 4 }
    else if (x >= 30 && x <= 37) { const cc = ["#000","#c00","#0c0","#cc0","#00c","#c0c","#0cc","#ccc"]; cf = cc[x - 30] }
    else if (x >= 40 && x <= 47) { const cc = ["#000","#c00","#0c0","#cc0","#00c","#c0c","#0cc","#ccc"]; cb = cc[x - 40] }
    else if (x >= 90 && x <= 97) { const cc = ["#444","#f44","#4f4","#ff4","#44f","#f4f","#4ff","#fff"]; cf = cc[x - 90] }
    else if (x >= 100 && x <= 107) { const cc = ["#444","#f44","#4f4","#ff4","#44f","#f4f","#4ff","#fff"]; cb = cc[x - 100] }
  }
}

for (let i = 0; i < frame.length; i++) {
  // OSC skip
  if (frame[i] === "\x1b" && frame[i + 1] === "]") {
    const bell = frame.indexOf("\x07", i); if (bell > i) { i = bell; continue }
    break
  }
  // CSI — handles \x1b[..., \x1b[?..., \x1b[>... etc
  if (frame[i] === "\x1b" && frame[i + 1] === "[") {
    // Find the command letter (A-Z, a-z)
    let cmdIdx = i + 2
    // Skip optional prefix chars like ?, >, !, $
    if (cmdIdx < frame.length && "?>!$\"' ".includes(frame[cmdIdx])) cmdIdx++
    // Skip numeric/separator parameters
    while (cmdIdx < frame.length && /[0-9;]/.test(frame[cmdIdx])) cmdIdx++
    const cmd = frame[cmdIdx]

    if (cmd === "m") {
      // SGR color
      const body = frame.slice(i + 2, cmdIdx)
      applySGR(body.split(";").filter(s => s && !" ?>!$\"'".includes(s[0])).map(Number))
      i = cmdIdx; continue
    }
    if (cmd === "H" || cmd === "f") {
      // Cursor position
      const parts = frame.slice(i + 2, cmdIdx).split(";").map(Number)
      if (parts[0]) r = parts[0]; if (parts[1]) c = parts[1]
      i = cmdIdx; continue
    }
    // All other CSI: skip entirely (cursor visibility, terminal modes, etc.)
    i = cmdIdx; continue
  }
  // Printable
  if (frame[i] === "\n") { r++; c = 1; i++; continue }
  if (frame[i] === "\r") { c = 1; i++; continue }
  if (frame[i] >= " ") { grid.set(`${r},${c}`, { ch: frame[i], fg: cf, bg: cb, bold: bd }); c++; continue }
  i++
}

// Render HTML
const ROWS = 24, COLS = 80
function esc(s: string) { return s === " " ? "&nbsp;" : s === "<" ? "&lt;" : s === ">" ? "&gt;" : s === "&" ? "&amp;" : s }

let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Helix TUI</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#060614;color:#ccc;font-family:"SF Mono",Menlo,Monaco,monospace;font-size:13px;line-height:1.35;padding:20px}
.g{display:grid;grid-template-columns:repeat(${COLS},1ch);border:1px solid #1a1a3a}
.g>div{width:1ch;height:1.35em;overflow:hidden;white-space:pre;text-align:center;font-size:11px}
.labels{display:grid;grid-template-columns:repeat(${COLS},1ch);margin-bottom:2px}
.labels span{font-size:9px;color:#333;text-align:center}
h2{color:#00ffcc;font-weight:400;margin-bottom:8px;font-size:14px}
p{color:#555;margin:6px 0;font-size:12px}
</style></head><body>
<h2>🔬 Helix TUI — Session View</h2>
<p>${ROWS}×${COLS} grid · ${grid.size} cells</p>
<div class="labels">${Array.from({length:COLS},(_,i)=>`<span>${(i+1)%10===0?i+1:""}</span>`).join("")}</div>
<div class="g">
`

for (let r = 1; r <= ROWS; r++) {
  for (let c = 1; c <= COLS; c++) {
    const cell = grid.get(`${r},${c}`)
    if (!cell) { h += `<div></div>`; continue }
    h += `<div style="color:${cell.fg};background:${cell.bg};${cell.bold?"font-weight:bold":""}">${esc(cell.ch)}</div>`
  }
}
h += `</div></body></html>`

writeFileSync(HTML_FILE, h)
console.log(`\n✅ ${HTML_FILE}`)
try { await $`open ${HTML_FILE}`.quiet() } catch {}
