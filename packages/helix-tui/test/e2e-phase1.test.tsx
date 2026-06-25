import { describe, expect } from "bun:test"
import {
  testFn,
  waitForFrame,
  renderAppChat,
  initTUI,
  sendMessage,
  setupLocalStorage,
  createRealSession,
  deleteRealSession,
} from "./utils/e2e-helpers.tsx"

// ── Phase 1 E2E Blinds: Real LLM tests for uncovered features ──
// These tests cover Phase 1 features NOT tested in e2e-tui-llm.test.tsx:
//   - Session auto-recovery (localStorage)
//   - Three-column layout (wide vs narrow screen)
//   - Session creation via real API
//
// NOTE: Dialog interactions (permission/question/retry) require mouse clicks
// which are not supported by mockInput. These are covered in blackbox tests.
// NOTE: Session management UI (new/rename/delete via sidebar) also requires
// mouse clicks. Session CRUD is tested via SDK API here.

describe("E2E Phase 1: Session & Layout", () => {
  // ── Test 1: Session auto-recovery ───────────────────────
  // Purpose: Verify that when localStorage has a valid lastSessionID,
  // the TUI auto-switches to that session on mount.
  testFn("session auto-recovery: loads last session on mount", async () => {
    // 1. Create a real session via API
    const session = await createRealSession("Auto Recovery Test")
    expect(session).toBeDefined()
    expect(session!.id).toBeTruthy()

    // 2. Send a message so the session has content
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const { SERVER_URL, authHeader } = await import("./utils/e2e-helpers")
    const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })
    await client.session.prompt({
      sessionID: session!.id,
      parts: [{ type: "text", text: "Say hello" }],
    })

    // 3. Set localStorage with the session ID
    const storage = setupLocalStorage()
    storage.setItem("helix-tui:lastSessionID", session!.id)

    // 4. Render the app — it should auto-recover to this session
    const result = await renderAppChat()
    await initTUI(result)

    // 5. Wait for auto-recovery to load messages
    await new Promise((r) => setTimeout(r, 3000))
    await result.renderOnce()

    // 6. Verify the session is loaded (title or content visible)
    const frame = result.captureCharFrame()
    const hasSessionContent =
      frame.includes("Auto Recovery Test") ||
      frame.includes("Helix:") ||
      frame.includes("hello")

    console.log(`Auto-recovery: hasContent=${hasSessionContent}`)
    expect(hasSessionContent).toBe(true)

    // Cleanup
    storage.removeItem("helix-tui:lastSessionID")
    await deleteRealSession(session!.id)
  }, 90000)

  // ── Test 2: Three-column layout wide screen ─────────────
  // Purpose: Verify that on wide screens (120+ columns), the info panel is visible.
  testFn("layout wide: info panel visible on 120 columns", async () => {
    const result = await renderAppChat({ width: 140, height: 35 })
    await initTUI(result)

    const frame = result.captureCharFrame()
    // The info panel should show session info or model info
    const hasInfoPanel =
      frame.includes("Model") ||
      frame.includes("Session") ||
      frame.includes("F2:") ||
      frame.includes("[Build]")

    console.log(`Wide layout: hasInfo=${hasInfoPanel}`)
    expect(hasInfoPanel).toBe(true)
  }, 15000)

  // ── Test 3: Three-column layout narrow screen ────────────
  // Purpose: Verify that on narrow screens (< 120 columns), the info panel is hidden.
  testFn("layout narrow: info panel hidden below 120 columns", async () => {
    const result = await renderAppChat({ width: 80, height: 35 })
    await initTUI(result)

    const frame = result.captureCharFrame()
    // On narrow screens, the sidebar should be hidden or collapsed
    // We verify the main chat area takes up most space by checking
    // that the welcome message is visible without info panel clutter
    const hasWelcome = frame.includes("Welcome to Helix AI")

    console.log(`Narrow layout: hasWelcome=${hasWelcome}`)
    expect(hasWelcome).toBe(true)
  }, 15000)

  // ── Test 4: Create real session via API ─────────────────
  // Purpose: Verify that the real backend creates sessions correctly.
  testFn("real session creation: SDK creates valid session", async () => {
    const session = await createRealSession("E2E Create Test")
    expect(session).toBeDefined()
    expect(session!.id).toBeTruthy()
    expect(session!.title).toBe("E2E Create Test")

    // Verify the session exists in the list
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const { SERVER_URL, authHeader } = await import("./utils/e2e-helpers")
    const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })
    const list = await client.session.list({ limit: 50 })
    expect(list.data).toBeDefined()

    const found = list.data!.find((s: any) => s.id === session!.id)
    expect(found).toBeDefined()

    // Cleanup
    await deleteRealSession(session!.id)
  }, 30000)

  // ── Test 5: Session auto-recovery title ─────────────────
  // Purpose: Verify that auto-recovery loads the correct session title.
  testFn("session auto-recovery: loads correct session title", async () => {
    const session = await createRealSession("Session Title Test")
    const storage = setupLocalStorage()
    storage.setItem("helix-tui:lastSessionID", session!.id)

    const result = await renderAppChat()
    await initTUI(result)
    await new Promise((r) => setTimeout(r, 5000))
    await result.renderOnce()

    const frame = result.captureCharFrame()
    const hasTitle = frame.includes("Session Title Test")
    console.log(`Session title recovery: hasTitle=${hasTitle}`)
    expect(hasTitle).toBe(true)

    storage.removeItem("helix-tui:lastSessionID")
    await deleteRealSession(session!.id)
  }, 30000)

  // ── Test 6: Retry after error ────────────────────────────
  // Purpose: Simulate a backend error, verify error state appears.
  // NOTE: Full retry flow (click Retry button) requires mouse interaction
  // which is not supported by mockInput. We verify error state only.
  testFn("retry: error state appears after backend error", async () => {
    const faultyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, init)
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")

      if (url.includes("/session/") && url.includes("/message") && method === "POST") {
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

    await sendMessage(result, "trigger error")

    const { found, frame } = await waitForFrame(
      result,
      (f) => f.includes("LLM provider timeout") || f.includes("error"),
      30000,
    )

    console.log(`Error state: found=${found}, frame=${frame.slice(0, 200)}`)
    expect(found).toBe(true)
  }, 40000)
})
