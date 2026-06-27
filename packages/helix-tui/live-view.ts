#!/usr/bin/env bun
/**
 * Helix TUI Live Preview — 实时捕获 TUI 界面，浏览器自动刷新
 *
 * 用法: bun run live-view.ts
 * 然后打开 http://localhost:3200
 */

import { $ } from "bun"
import { createOpencodeClient } from "@mimo-ai/sdk/v2"
import { readFileSync, existsSync, unlinkSync, watchFile } from "fs"
import { resolve } from "path"

const PORT = 3200
const SERVER_PORT = 3102
const SERVER_URL = `http://localhost:${SERVER_PORT}`
const MIMOCODE_HOME = process.env.HOME + "/.config/mimocode"
const HELIX_DIR = import.meta.dir
const OPENCODE_DIR = resolve(HELIX_DIR, "../opencode")
const ANS_FILE = "/tmp/helix-live-capture.ans"

// Ensure config
await $`mkdir -p ${MIMOCODE_HOME}/config`.quiet()
if (!existsSync(MIMOCODE_HOME + "/config/mimocode.json") && existsSync(MIMOCODE_HOME + "/mimocode.json"))
  await $`cp ${MIMOCODE_HOME}/mimocode.json ${MIMOCODE_HOME}/config/mimocode.json`.quiet()

// 1. Start Helix Server
console.log("Starting Helix Server...")
const server = Bun.spawn(["bun", "--conditions=browser", resolve(OPENCODE_DIR, "src/index.ts"), "serve", "--port", String(SERVER_PORT)], {
  env: { ...process.env, MIMOCODE_HOME, MIMOCODE_LOG_LEVEL: "ERROR" },
  stdout: "ignore", stderr: "ignore",
})
await Bun.sleep(4000)

// 2. Create sessions
console.log("Creating test sessions...")
const client = createOpencodeClient({ baseUrl: SERVER_URL })
const s = await client.session.create({ title: "Live Preview" })
await client.session.prompt({ sessionID: s.data!.id, parts: [{ type: "text", text: "Write fibonacci(n) in Python." }] })
await client.session.prompt({ sessionID: s.data!.id, parts: [{ type: "text", text: "Add a while-loop version." }] })
console.log("   ✓ 2 turns created")

// 3. Start TUI with script (PTY)
console.log("Starting TUI via PTY...")
try { unlinkSync(ANS_FILE) } catch {}
const tuiProc = Bun.spawn(["script", "-q", ANS_FILE, "bash", "-c",
  `cd "${HELIX_DIR}" && HELIX_URL=${SERVER_URL} HELIX_CONTINUE=1 MIMOCODE_HOME=${MIMOCODE_HOME} MIMOCODE_LOG_LEVEL=ERROR bun --conditions=browser src/index.ts`
], { stdout: "ignore", stderr: "ignore" })

// 4. HTTP server with live refresh
console.log(`\n🌐 Live Preview: http://localhost:${PORT}\n`)

function ansToHtml(raw: string): string {
  const grid = new Map<string, { ch: string; fg: string; bg: string; bold: boolean }>()
  let r = 1, c = 1, cf = "#ccc", cb = "#060614", bd = false
  const DF = "#ccc", DB = "#060614"

  function applySGR(codes: number[]) {
    for (let j = 0; j < codes.length; j++) {
      const x = codes[j]
      if (x === 0) { cf = DF; cb = DB; bd = false }
      else if (x === 1) bd = true; else if (x === 22) bd = false
      else if (x === 39) cf = DF; else if (x === 49) cb = DB
      else if (x === 38 && codes[j + 1] === 2) { cf = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`; j += 4 }
      else if (x === 48 && codes[j + 1] === 2) { cb = `rgb(${codes[j+2]},${codes[j+3]},${codes[j+4]})`; j += 4 }
      else if (x >= 30 && x <= 37) { const cc = ["#000","#c00","#0c0","#cc0","#00c","#c0c","#0cc","#ccc"]; cf = cc[x - 30] }
      else if (x >= 40 && x <= 47) { const cc = ["#000","#c00","#0c0","#cc0","#00c","#c0c","#0cc","#ccc"]; cb = cc[x - 40] }
      else if (x >= 90 && x <= 97) { const cc = ["#444","#f44","#4f4","#ff4","#44f","#f4f","#4ff","#fff"]; cf = cc[x - 90] }
      else if (x >= 100 && x <= 107) { const cc = ["#444","#f44","#4f4","#ff4","#44f","#f4f","#4ff","#fff"]; cb = cc[x - 100] }
    }
  }

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\x1b" && raw[i + 1] === "]") {
      const bell = raw.indexOf("\x07", i); if (bell > i) { i = bell; continue }
      break
    }
    if (raw[i] === "\x1b" && raw[i + 1] === "[") {
      let cmdIdx = i + 2
      if (cmdIdx < raw.length && "?>!$\"' ".includes(raw[cmdIdx])) cmdIdx++
      while (cmdIdx < raw.length && /[0-9;]/.test(raw[cmdIdx])) cmdIdx++
      const cmd = raw[cmdIdx]
      if (cmd === "m") {
        applySGR(raw.slice(i + 2, cmdIdx).split(";").filter(s => s && !" ?>!$\"'".includes(s[0])).map(Number))
        i = cmdIdx; continue
      }
      if (cmd === "H" || cmd === "f") {
        const parts = raw.slice(i + 2, cmdIdx).split(";").map(Number)
        if (parts[0]) r = parts[0]; if (parts[1]) c = parts[1]
        i = cmdIdx; continue
      }
      i = cmdIdx; continue
    }
    if (raw[i] === "\n") { r++; c = 1; i++; continue }
    if (raw[i] === "\r") { c = 1; i++; continue }
    if (raw[i] >= " ") { grid.set(`${r},${c}`, { ch: raw[i], fg: cf, bg: cb, bold: bd }); c++; continue }
    i++
  }

  const ROWS = 24, COLS = 80
  function esc(s: string) { return s === " " ? "&nbsp;" : s === "<" ? "&lt;" : s === ">" ? "&gt;" : s === "&" ? "&amp;" : s }

  let h = `<div class="g">`
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const cell = grid.get(`${r},${c}`)
      if (!cell) { h += `<div></div>`; continue }
      h += `<div style="color:${cell.fg};background:${cell.bg};${cell.bold ? "font-weight:bold" : ""}">${esc(cell.ch)}</div>`
    }
  }
  h += `</div>`
  return h
}

// Serve HTTP
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/frame") {
      // Return the current TUI frame as HTML
      if (!existsSync(ANS_FILE)) return new Response("waiting...", { headers: { "Content-Type": "text/plain" } })
      const raw = readFileSync(ANS_FILE, "utf-8")
      const html = ansToHtml(raw)
      return new Response(html, { headers: { "Content-Type": "text/html" } })
    }
    // Main page
    return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Helix TUI Live</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#060614;color:#ccc;font-family:"SF Mono",Menlo,Monaco,monospace;font-size:13px;line-height:1.35;padding:16px}
.g{display:grid;grid-template-columns:repeat(80,1ch);border:1px solid #1a1a3a}
.g>div{width:1ch;height:1.35em;overflow:hidden;white-space:pre;text-align:center;font-size:11px}
.labels{display:grid;grid-template-columns:repeat(80,1ch);margin-bottom:2px}
.labels span{font-size:9px;color:#333;text-align:center}
h2{color:#00ffcc;font-weight:400;margin-bottom:4px;font-size:14px}
p{color:#555;margin:4px 0 12px;font-size:12px}
#status{color:#0c0;font-size:11px;margin-left:8px}
</style></head><body>
<h2>🔬 Helix TUI — Live Preview <span id="status"></span></h2>
<p>24×80 grid · Auto-refresh every 2s</p>
<div class="labels">${Array.from({length:80},(_,i)=>`<span>${(i+1)%10===0?i+1:""}</span>`).join("")}</div>
<div id="view"></div>
<script>
let count=0
async function refresh(){try{const r=await fetch("/frame");document.getElementById("view").innerHTML=await r.text();count++;document.getElementById("status").textContent="frame #"+count}catch(e){document.getElementById("status").textContent="waiting...";document.getElementById("status").style.color="#c90"}}
refresh();setInterval(refresh,2000)
</script></body></html>`, { headers: { "Content-Type": "text/html" } })
  },
})

console.log("Press Ctrl+C to stop")
