#!/usr/bin/env bun --conditions=browser
// @ts-nocheck

import { resolve } from "../../opencode/src/cli/cmd/tui/config/index.tsx"
/**
 * Helix TUI — self-contained entry point.
 *
 * By default, spawns a Worker thread running the Helix AI server in-process
 * (same as opencode). No separate server needed — just `bun dev`.
 *
 * Set HELIX_URL to connect to an external Helix Server instead.
 */

import { tui } from "../../opencode/src/cli/cmd/tui/app.tsx"
import { TuiConfig } from "../../opencode/src/cli/cmd/tui/config/index.tsx"

import path from "path"
import { existsSync } from "fs"

// Find the nearest git root, falling back to current directory
function findGitRoot(start: string): string {
  let dir = path.resolve(start)
  while (dir !== "/") {
    if (existsSync(path.join(dir, ".git"))) return dir
    dir = path.dirname(dir)
  }
  return path.resolve(start)
}

const cwd = findGitRoot(process.cwd())
const externalUrl = process.env["HELIX_URL"]

if (externalUrl) {
  const config = resolve({}, { terminalSuspend: true })
  await tui({ url: externalUrl, config, directory: cwd, args: { continue: !!process.env["HELIX_CONTINUE"] || undefined } })
} else {
  const { Rpc } = await import("../../opencode/src/util/index.ts")

  const env = {
    ...process.env,
    MIMOCODE_PROCESS_ROLE: "worker",
    MIMOCODE_RUN_ID: `helix-${Date.now()}`,
    MIMOCODE_LOG_LEVEL: "ERROR",
  }
  if (process.env["MIMOCODE_HOME"]) env.MIMOCODE_HOME = process.env["MIMOCODE_HOME"]

  const workerPath = Bun.resolveSync("../../opencode/src/cli/cmd/tui/worker.ts", import.meta.dir)
  const worker = new Worker(workerPath, { env })
  worker.onerror = (e) => console.error("[helix] worker error:", e.message)

  const client = Rpc.client(worker)

  const workerFetch = async (input, init) => {
    const req = new Request(input, init)
    const body = req.body ? await req.text() : undefined
    const res = await client.call("fetch", {
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      body,
    })
    return new Response(res.body, { status: res.status, headers: res.headers })
  }

  const events = {
    subscribe: async (handler) => client.on("global.event", (e) => handler(e)),
  }

  process.on("SIGUSR2", () => client.call("reload", undefined).catch(() => {}))

  const config = resolve({}, { terminalSuspend: true })

  setTimeout(() => client.call("checkUpgrade", { directory: cwd }).catch(() => {}), 1000)

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    await client.call("shutdown", undefined).catch(() => {})
    worker.terminate()
  }
  process.on("SIGINT", () => stop().then(() => process.exit(0)))
  process.on("SIGTERM", () => stop().then(() => process.exit(0)))

  await tui({
    url: "http://helix.internal",
    config,
    directory: cwd,
    fetch: workerFetch,
    events,
    args: { continue: !!process.env["HELIX_CONTINUE"] || undefined },
  })

  await stop()
  process.exit(0)
}
