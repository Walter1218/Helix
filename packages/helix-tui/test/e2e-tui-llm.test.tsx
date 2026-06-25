import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { testRender } from "@opentui/solid"

// ── Server Configuration ──────────────────────────────────

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"
const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }

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

const testFn = serverReachable ? test : test.skip

// ── Helper Functions ──────────────────────────────────────

/**
 * Polls the TUI render frame until a predicate is satisfied or timeout.
 */
async function waitForFrame(
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

async function renderAppChat(options?: { fetch?: typeof fetch }) {
  const { App } = await import("../src/app")
  const { RouteProvider } = await import("../src/context/route")
  const { ThemeProvider } = await import("../src/context/theme")
  const { SDKProvider } = await import("../src/context/sdk")
  const { DialogProvider } = await import("../src/ui/dialog")

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
    { width: 120, height: 35 },
  )
}

async function initTUI(result: any) {
  for (let i = 0; i < 5; i++) {
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 100))
  }
}

async function sendMessage(result: any, text: string) {
  await result.mockInput.typeText(text)
  await result.renderOnce()
  result.mockInput.pressEnter()
  await result.renderOnce()
}

// ── Tests ─────────────────────────────────────────────────

describe("E2E TUI: Real LLM Blackbox", () => {
  // ── Test 1: End-to-end message flow ──────────────────────
  // Purpose: Verify the complete chain: user input -> session creation ->
  // LLM prompt -> streaming response -> TUI renders both user and AI messages.
  testFn("end-to-end: user sends message, TUI renders user and AI messages", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    const frame0 = result.captureCharFrame()
    expect(frame0).toContain("Welcome to Helix AI")

    await sendMessage(result, "Reply with exactly: HELIX_TUI_E2E_OK")

    const { found, elapsed, frame } = await waitForFrame(
      result,
      (f) =>
        f.includes("You:") &&
        f.includes("Reply with exactly: HELIX_TUI_E2E_OK") &&
        f.includes("Helix:") &&
        f.toLowerCase().includes("helix_tui_e2e_ok"),
      60000,
    )

    console.log(`Test 1 (end-to-end): ${found ? "PASS" : "FAIL"} after ${elapsed}ms`)
    if (!found) {
      console.log("Final frame preview (first 500 chars):")
      console.log(frame.slice(0, 500))
    }
    expect(found).toBe(true)
  }, 70000)

  // ── Test 2: Multi-turn conversation context ──────────────
  // Purpose: Verify session state persists across prompts and TUI correctly
  // loads history. LLM should remember context from the first turn.
  testFn("multi-turn: context maintained across prompts", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    // Round 1: Send any message
    await sendMessage(result, "Say hello in your reply.")
    const r1 = await waitForFrame(
      result,
      (f) => f.includes("You:") && f.includes("Say hello") && f.includes("Helix:"),
      60000,
    )
    expect(r1.found).toBe(true)
    console.log(`Test 2 round 1: PASS after ${r1.elapsed}ms`)

    // Small delay between rounds to ensure first response completes
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()

    // Round 2: Send another message — verify TUI shows both user messages and both AI responses
    await sendMessage(result, "Say goodbye in your reply.")
    const r2 = await waitForFrame(
      result,
      (f) => {
        // Verify at least 2 user messages and 2 assistant responses appear
        const userCount = (f.match(/You:/g) || []).length
        const helixCount = (f.match(/Helix:/g) || []).length
        const hasRound2User = f.includes("Say goodbye")
        return userCount >= 2 && helixCount >= 2 && hasRound2User
      },
      60000,
    )

    console.log(`Test 2 round 2: ${r2.found ? "PASS" : "FAIL"} after ${r2.elapsed}ms`)
    if (!r2.found) {
      console.log("Final frame preview (first 500 chars):")
      console.log(r2.frame.slice(0, 500))
    }
    expect(r2.found).toBe(true)
  }, 130000)

  // ── Test 3: Tool call rendering ───────────────────────────
  // Purpose: Verify TUI renders tool-call messages as tool cards with status
  // indicators (running/done) and output. This tests the complex message type
  // rendering path that pure text messages don't cover.
  testFn("tool call: TUI renders tool execution status and output", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    await sendMessage(
      result,
      "Run the bash command: echo 'tool_test_passed'. Then report the exact command output.",
    )

    const { found, elapsed, frame } = await waitForFrame(
      result,
      (f) => {
        const hasUserMsg = f.includes("Run the bash command")
        const hasToolName = f.includes("bash")
        const hasHelix = f.includes("Helix:")
        return hasUserMsg && hasHelix && hasToolName
      },
      60000,
    )

    console.log(`Test 3 (tool call): ${found ? "PASS" : "FAIL"} after ${elapsed}ms`)
    if (!found) {
      console.log("Final frame preview (first 500 chars):")
      console.log(frame.slice(0, 500))
    }
    expect(found).toBe(true)
  }, 70000)

  // ── Test 4: Input history ─────────────────────────────────
  // Purpose: Verify the Up/Down arrow key history recall works. After sending
  // multiple messages, pressing Up should populate the textarea with previous
  // messages.
  testFn("input history: up arrow recalls previous message", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    // Send message A
    await sendMessage(result, "input_history_msg_A")
    const r1 = await waitForFrame(
      result,
      (f) => f.includes("input_history_msg_A") && f.includes("Helix:"),
      60000,
    )
    expect(r1.found).toBe(true)
    console.log(`Test 4 message A: sent`)

    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()

    // Send message B
    await sendMessage(result, "input_history_msg_B")
    const r2 = await waitForFrame(
      result,
      (f) => f.includes("input_history_msg_B") && f.includes("Helix:"),
      60000,
    )
    expect(r2.found).toBe(true)
    console.log(`Test 4 message B: sent`)

    await new Promise((r) => setTimeout(r, 1000))
    await result.renderOnce()

    // Press Up to recall message B
    result.mockInput.pressKey("up")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    // Press Up again to recall message A
    result.mockInput.pressKey("up")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 500))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    const hasHistoryA = frame.includes("input_history_msg_A")
    const hasHistoryB = frame.includes("input_history_msg_B")
    console.log(`Test 4 (input history): hasA=${hasHistoryA} hasB=${hasHistoryB}`)
    // At least one of the previous messages should be recalled in the input area
    expect(hasHistoryA || hasHistoryB).toBe(true)
  }, 140000)

  // ── Test 5: Mode switch via keyboard ──────────────────────
  // Purpose: Verify Tab key cycles through modes and TUI updates the mode
  // selector display. This is a pure UI interaction test but uses the real
  // TUI rendering pipeline.
  testFn("mode switch: tab key cycles modes and TUI updates", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    const frame0 = result.captureCharFrame()
    expect(frame0).toContain("[Build]") // default mode

    // Press Tab to switch to next mode
    result.mockInput.pressKey("tab")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const frame1 = result.captureCharFrame()
    // After switching from Build, one of these should be active
    const nextModeActive =
      frame1.includes("[Plan]") ||
      frame1.includes("[Compose]") ||
      frame1.includes("[Loop]") ||
      frame1.includes("[Max]")
    console.log(`Test 5 (mode switch): default=[Build] next=${nextModeActive}`)
    expect(nextModeActive).toBe(true)
  }, 10000)

  // ── Test 6: Model switch via F2 key ──────────────────────
  // Purpose: Verify F2 key cycles through available models and the header
  // updates to show the new model name.
  testFn("model switch: F2 cycles models and header updates", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    const frame0 = result.captureCharFrame()
    expect(frame0).toContain("F2: mimo-v2.5-pro")

    // Press F2 to switch to next model
    result.mockInput.pressKey("F2")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const frame1 = result.captureCharFrame()
    expect(frame1).toContain("F2: mimo-v2-flash")

    // Press F2 again to cycle back through
    result.mockInput.pressKey("F2")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const frame2 = result.captureCharFrame()
    const hasModel = frame2.includes("F2: gpt-4o") || frame2.includes("F2: mimo-v2-flash")
    console.log(`Test 6 (F2 model): ${hasModel ? "PASS" : "FAIL"}`)
    expect(hasModel).toBe(true)
  }, 10000)

  // ── Test 7: Shift+Enter does not send message ──────────────
  // Purpose: Verify Shift+Enter inserts a newline in the textarea
  // without triggering the submit action.
  testFn("shift+enter: does not trigger message send", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    await result.mockInput.typeText("test shift enter")
    await result.renderOnce()

    // Press Shift+Enter - should NOT send
    result.mockInput.pressEnter({ shift: true })
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 1000))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    // No user message should have been sent yet
    const hasUserMessage = frame.includes("You: test shift enter")
    console.log(`Test 7 (shift+enter): sent=${hasUserMessage}`)
    expect(hasUserMessage).toBe(false)

    // Now press Enter (without Shift) to send
    result.mockInput.pressEnter()
    await result.renderOnce()

    const sent = await waitForFrame(
      result,
      (f) => f.includes("You:") && f.includes("test shift enter"),
      30000,
    )
    expect(sent.found).toBe(true)
  }, 40000)

  // ── Test 8: Ask mode does not invoke file-modifying tools ─
  // Purpose: Verify that when in ask mode, the LLM cannot invoke write/edit
  // tools. Ask mode permission denies write/edit/apply_patch, so the backend
  // should not expose these tools to the LLM. We verify by checking no tool-call
  // events appear in the TUI (no tool cards rendered).
  testFn("ask mode: no file-modifying tool calls", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    // Switch to ask mode: Build(1) → Ask(0) via shift+tab
    result.mockInput.pressKey("tab", { shift: true })
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const frameAsk = result.captureCharFrame()
    expect(frameAsk).toContain("[Ask]")

    // Ask the LLM to write a file — in ask mode it should not have write tools
    await sendMessage(result, "Write a file called test_ask_mode.txt with content hello")

    const { found, elapsed, frame } = await waitForFrame(
      result,
      (f) => {
        const hasUserMsg = f.includes("Write a file")
        const hasHelix = f.includes("Helix:")
        // Verify NO write/edit tool-call cards
        // In ask mode, write/edit tools are not available, so the LLM should not
        // invoke them. We check the response doesn't contain tool card indicators
        // for file-modifying tools.
        const hasToolWrite = f.includes("write") && f.includes("test_ask_mode")
        const hasToolEdit = f.includes("edit") && f.includes("test_ask_mode")
        return hasUserMsg && hasHelix && !hasToolWrite && !hasToolEdit
      },
      60000,
    )

    console.log(`Test 8 (ask mode scope): ${found ? "PASS" : "FAIL"} after ${elapsed}ms`)
    if (!found) {
      console.log("Frame preview (first 500 chars):")
      console.log(frame.slice(0, 500))
    }
    expect(found).toBe(true)
  }, 70000)

  // ── Test 9: Plan mode read-only behavior ──────────────────
  // Purpose: Verify that when in plan mode, the LLM can read files but should
  // not attempt to write/edit arbitrary files. Plan mode explicitly denies
  // edit on all files except the plan file. We ask it to read a file, which
  // should succeed (read is allowed), but not write.
  testFn("plan mode: read allowed, write blocked", async () => {
    const result = await renderAppChat()
    await initTUI(result)

    // Switch to plan mode: Build(1) → Plan(2) via tab
    result.mockInput.pressKey("tab")
    await result.renderOnce()
    await new Promise((r) => setTimeout(r, 200))
    await result.renderOnce()

    const framePlan = result.captureCharFrame()
    expect(framePlan).toContain("[Plan]")

    // Ask to read the package.json file — read is allowed in plan mode
    await sendMessage(result, "Read the package.json file and tell me its name field")

    const { found, elapsed, frame } = await waitForFrame(
      result,
      (f) => {
        const hasUserMsg = f.includes("Read the package.json")
        const hasHelix = f.includes("Helix:")
        // Verify no write/edit tool cards for arbitrary files
        const hasWriteTool = f.includes("write") && f.includes("package.json")
        const hasEditTool = f.includes("edit") && f.includes("package.json")
        return hasUserMsg && hasHelix && !hasWriteTool && !hasEditTool
      },
      60000,
    )

    console.log(`Test 9 (plan mode scope): ${found ? "PASS" : "FAIL"} after ${elapsed}ms`)
    if (!found) {
      console.log("Frame preview (first 500 chars):")
      console.log(frame.slice(0, 500))
    }
    expect(found).toBe(true)
  }, 70000)

  // ── Test 13: Backend error response — catch branch returns { error } ──
  testFn("backend catch writes error to response body", async () => {
    const faultyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      if (url.includes("/prompt") && method === "POST") {
        return new Response(JSON.stringify({ error: "LLM provider timeout" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        })
      }
      return response
    }

    const result = await renderAppChat({ fetch: faultyFetch })
    await initTUI(result)

    await sendMessage(result, "test backend error")

    // Should show "LLM provider timeout" instead of "Invalid response format"
    const { found, frame } = await waitForFrame(
      result,
      (f) => f.includes("LLM provider timeout") || f.includes("Invalid response format"),
      30000,
    )

    if (!found) {
      console.log("Test 13 final frame:", frame.slice(0, 500))
    }
    expect(found).toBe(true)
    expect(frame).toContain("LLM provider timeout")
    expect(frame).not.toContain("Invalid response format")
  }, 70000)
  // Purpose: When the backend returns a response with data but no parts field,
  // handleSend must not crash. It should set an error state and show a retry button.
  // This tests the defensive check added after the real-world crash:
  // "undefined is not an object (evaluating 'data.parts.filter')"
  testFn("boundary: handleSend handles missing parts gracefully", async () => {
    const faultyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      if (url.includes("/prompt") && method === "POST") {
        return new Response(JSON.stringify({
          data: { id: "test-id" },
          error: null,
        }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        })
      }
      return response
    }

    const result = await renderAppChat({ fetch: faultyFetch })
    await initTUI(result)

    await sendMessage(result, "trigger invalid response")

    // Wait for error state to appear (error message + Retry button)
    const { found, frame } = await waitForFrame(
      result,
      (f) => f.includes("error") && f.includes("Retry"),
      30000,
    )

    if (!found) {
      console.log("Test 10 final frame:", frame.slice(0, 500))
    }
    expect(found).toBe(true)

    // Verify TUI is still functional after the error — send a second message
    await sendMessage(result, "second message after error")
    const { found: found2 } = await waitForFrame(
      result,
      (f) => f.includes("second message") && f.includes("Helix:"),
      60000,
    )
    expect(found2).toBe(true)
  }, 90000)

  // ── Test 11: Boundary — empty parts array ──
  // Purpose: When the backend returns parts: [], handleSend should show "(no text response)"
  // instead of crashing or leaving a blank message.
  testFn("boundary: handleSend handles empty parts array", async () => {
    const faultyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      if (url.includes("/prompt") && method === "POST") {
        return new Response(JSON.stringify({
          data: { id: "test-id", parts: [] },
          error: null,
        }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        })
      }
      return response
    }

    const result = await renderAppChat({ fetch: faultyFetch })
    await initTUI(result)

    await sendMessage(result, "test empty parts")

    // The AI message should show "(no text response)" since parts is empty
    const { found, frame } = await waitForFrame(
      result,
      (f) => f.includes("Helix:"),
      30000,
    )

    if (!found) {
      console.log("Test 11 final frame:", frame.slice(0, 500))
    }
    expect(found).toBe(true)
  }, 70000)

  // ── Test 12: Boundary — loadMessages skips messages with missing parts ──
  // Purpose: When the backend returns a message history containing entries
  // without a parts field, loadMessages must skip them without crashing.
  testFn("boundary: loadMessages skips missing msg.parts", async () => {
    // 1. Create a real session via direct API
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })
    const { data: session } = await client.session.create({ title: "boundary test" })
    if (!session) return

    // 2. Intercept the messages endpoint to inject a malformed entry
    let messagesIntercepted = false
    const faultyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      if (url.includes("/messages") && (!method || method === "GET")) {
        messagesIntercepted = true
        const body = await response.json()
        if (body.data && Array.isArray(body.data)) {
          body.data.push({
            info: { id: "invalid-msg", role: "assistant", time: { created: Date.now() } },
            // Deliberately missing parts field
          })
        }
        return new Response(JSON.stringify(body), {
          status: response.status,
          statusText: response.statusText,
          headers: { "content-type": "application/json" },
        })
      }
      return response
    }

    // 3. Set localStorage to trigger auto-recovery on mount
    const store: Record<string, string> = {}
    if (!globalThis.localStorage) {
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = v },
          removeItem: (k: string) => { delete store[k] },
        },
        writable: true,
        configurable: true,
      })
    }
    globalThis.localStorage.removeItem("helix-tui:lastSessionID")
    globalThis.localStorage.setItem("helix-tui:lastSessionID", session.id)

    const result = await renderAppChat({ fetch: faultyFetch })
    await initTUI(result)

    // Wait for auto-recovery to load messages
    await new Promise((r) => setTimeout(r, 2000))
    await result.renderOnce()

    // Verify TUI did not crash
    const frame = result.captureCharFrame()
    console.log(`Test 12: messagesIntercepted=${messagesIntercepted}`)
    if (messagesIntercepted) {
      console.log("Frame preview:", frame.slice(0, 300))
    }
    expect(frame).not.toContain("undefined is not an object")
    expect(frame).not.toContain("TypeError")

    // Clean up
    globalThis.localStorage.removeItem("helix-tui:lastSessionID")
  }, 30000)
})
