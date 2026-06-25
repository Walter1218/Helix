import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { testRender } from "@opentui/solid"
import type { JSXElement } from "solid-js"

// ── Server Configuration ──────────────────────────────────

export const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
export const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"
export const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
export const TIMEOUT = 60_000

// Check server reachability at module load time
let serverReachable = false
try {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  const res = await fetch(`${SERVER_URL}/global/health`, { signal: controller.signal, headers: authHeader })
  clearTimeout(timeout)
  serverReachable = res.ok
} catch {
  serverReachable = false
}

let serverProc: any = null

// Try to start server if not reachable
beforeAll(async () => {
  if (serverReachable) return

  console.log("Real backend not detected. Attempting to start mimo serve...")
  try {
    serverProc = Bun.spawn(
      [
        "bun", "run", "--cwd", "../opencode",
        "--conditions=browser", "src/index.ts", "serve", "--port", "3095",
      ],
      {
        env: { ...process.env, MIMOCODE_SERVER_PASSWORD: SERVER_PASSWORD },
        stdout: "pipe",
        stderr: "pipe",
      },
    )

    // Wait up to 30 seconds for server to start
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(`${SERVER_URL}/global/health`, { signal: controller.signal, headers: authHeader })
        clearTimeout(timeout)
        if (res.ok) {
          serverReachable = true
          console.log(`Server started successfully after ${i + 1}s`)
          break
        }
      } catch {}
    }
  } catch (e: any) {
    console.error("Failed to start server:", e.message)
  }

  if (!serverReachable) {
    console.log("Server still not reachable. E2E TUI LLM tests will be skipped.")
    console.log("To run these tests, start the backend manually:")
    console.log("  mimo serve --port 3095")
    console.log("Or set MIMOCODE_SERVER_PASSWORD if using authentication.")
  }
}, 35000)

afterAll(async () => {
  if (serverProc) {
    serverProc.kill()
    await new Promise((r) => setTimeout(r, 1000))
  }
})

export const testFn = serverReachable ? test : test.skip
export { serverReachable }

// ── Helper Functions ──────────────────────────────────────

/**
 * Polls the TUI render frame until a predicate is satisfied or timeout.
 */
export async function waitForFrame(
  result: any,
  predicate: (frame: string) => boolean,
  maxWaitMs: number = 60000,
  intervalMs: number = 2000,
) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await result.renderOnce()
    const frame = result.captureCharFrame()
    if (predicate(frame)) {
      return { frame, found: true, elapsed: Date.now() - start }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  await result.renderOnce()
  return { frame: result.captureCharFrame(), found: false, elapsed: Date.now() - start }
}

export async function renderAppChat(options?: { fetch?: typeof fetch; width?: number; height?: number }) {
  const { App } = await import("../../src/app")
  const { RouteProvider } = await import("../../src/context/route")
  const { ThemeProvider } = await import("../../src/context/theme")
  const { SDKProvider } = await import("../../src/context/sdk")
  const { DialogProvider } = await import("../../src/ui/dialog")

  return testRender(
    () => (
      <SDKProvider url={SERVER_URL} headers={authHeader} fetch={options?.fetch}>
        <ThemeProvider>
          <DialogProvider>
            <RouteProvider initialRoute={{ type: "chat" }}>
              <App />
            </RouteProvider>
          </DialogProvider>
        </ThemeProvider>
      </SDKProvider>
    ),
    { width: options?.width ?? 120, height: options?.height ?? 35 },
  )
}

export async function initTUI(result: any) {
  for (let i = 0; i < 5; i++) {
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 100))
  }
}

export async function sendMessage(result: any, text: string) {
  await result.mockInput.typeText(text)
  await result.renderOnce()
  result.mockInput.pressEnter()
  await result.renderOnce()
}

/**
 * Setup localStorage mock for testing session recovery.
 */
export function setupLocalStorage() {
  const store: Record<string, string> = {}
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    },
    writable: true,
    configurable: true,
  })
  return globalThis.localStorage as {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
  }
}

/**
 * Create a real session via SDK API for E2E tests.
 */
export async function createRealSession(title: string) {
  const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })
  const result = await client.session.create({ title })
  return result.data
}

/**
 * Delete a real session via SDK API.
 */
export async function deleteRealSession(sessionID: string) {
  const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
  const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })
  try {
    await client.session.delete({ sessionID })
  } catch {
    // ignore
  }
}
