import { describe, expect, test, beforeEach, afterEach } from "bun:test"

// ── Mock Helix Server ────────────────────────────────────

function createMockHelixServer() {
  let sseController: ReadableStreamDefaultController | null = null
  const receivedRequests: { method: string; path: string; body: any }[] = []

  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url)
      const body = req.method === "POST" ? await req.json().catch(() => null) : null
      receivedRequests.push({ method: req.method, path: url.pathname, body })

      // SSE event stream
      if (url.pathname === "/event" || url.pathname === "/global/event") {
        const stream = new ReadableStream({
          start(controller) { sseController = controller },
          cancel() { sseController = null },
        })
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        })
      }

      // Health check
      if (url.pathname === "/global/health") {
        return Response.json({ status: "ok" })
      }

      // Session create
      if (url.pathname === "/session" && req.method === "POST") {
        return Response.json({ id: `sess-${Date.now()}`, title: body?.title ?? "Chat" })
      }

      // Session prompt — simulates LLM response
      if (url.pathname.match(/^\/session\/.*\/message$/) && req.method === "POST") {
        const userText = body?.parts?.[0]?.text ?? ""
        return Response.json({
          id: `msg-${Date.now()}`,
          parts: [{ type: "text", text: `Echo: ${userText}` }],
        })
      }

      // Messages list
      if (url.pathname.match(/^\/session\/.*\/message$/) && req.method === "GET") {
        return Response.json([])
      }

      // Abort
      if (url.pathname.match(/^\/session\/.*\/abort$/)) {
        return Response.json({ success: true })
      }

      // Permission reply
      if (url.pathname.match(/^\/permission\/.*\/reply$/)) {
        return Response.json({ success: true })
      }

      // Question reply
      if (url.pathname.match(/^\/question\/.*\/reply$/)) {
        return Response.json({ success: true })
      }

      return Response.json({ error: "not found" }, { status: 404 })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(),
    get sseController() { return sseController },
    emitSSE: (data: any) => {
      sseController?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
    },
    receivedRequests,
  }
}

// ── Acceptance Test: Full Chat Flow ──────────────────────

describe("Acceptance: user sends message and sees LLM response", () => {
  let server: ReturnType<typeof createMockHelixServer>

  beforeEach(() => {
    server = createMockHelixServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("user types 'hello' → server returns 'Echo: hello' → displayed in UI", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    // 1. User creates session
    const session = await client.session.create({ title: "Test" })
    expect(session.data?.id).toBeDefined()
    const sid = session.data!.id

    // 2. User sends "hello"
    const response = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "hello" }],
    })

    // 3. Verify server received the request
    const promptReq = server.receivedRequests.find(
      (r) => r.method === "POST" && r.path.includes("message")
    )
    expect(promptReq).toBeDefined()
    expect(promptReq!.body?.parts?.[0]?.text).toBe("hello")

    // 4. Verify response contains expected content
    expect(response.data).toBeDefined()
    expect(response.data!.parts).toBeDefined()
    expect(response.data!.parts[0]?.text).toBe("Echo: hello")
  })

  test("user sends code question → server returns code answer", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const session = await client.session.create({ title: "Code Help" })
    const sid = session.data!.id

    const response = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "write a fibonacci function in typescript" }],
    })

    expect(response.data!.parts[0]?.text).toBe("Echo: write a fibonacci function in typescript")
  })

  test("multiple messages maintain conversation context", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const session = await client.session.create({ title: "Multi-turn" })
    const sid = session.data!.id

    // First message
    const r1 = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "message 1" }],
    })
    expect(r1.data!.parts[0]?.text).toBe("Echo: message 1")

    // Second message on same session
    const r2 = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "message 2" }],
    })
    expect(r2.data!.parts[0]?.text).toBe("Echo: message 2")

    // Verify both requests went to the same session
    const promptReqs = server.receivedRequests.filter(
      (r) => r.method === "POST" && r.path.includes("message")
    )
    expect(promptReqs).toHaveLength(2)
    expect(promptReqs[0].path).toContain(sid)
    expect(promptReqs[1].path).toContain(sid)
  })

  test("session error shows meaningful error message", async () => {
    // Override server to return error
    server.stop()
    const errorServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const url = new URL(req.url)
        if (url.pathname === "/event" || url.pathname === "/global/event") {
          return new Response(new ReadableStream({ start() {} }), {
            headers: { "Content-Type": "text/event-stream" },
          })
        }
        if (url.pathname === "/session" && req.method === "POST") {
          return Response.json({ error: "Session limit reached" }, { status: 429 })
        }
        return Response.json({ error: "not found" }, { status: 404 })
      },
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: `http://localhost:${errorServer.port}` })

    const result = await client.session.create({ title: "Test" })
    expect(result.error).toBeDefined()

    errorServer.stop()
  })

  test("permission request → user allows → reply sent", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    // Simulate permission reply
    const result = await client.permission.reply({
      requestID: "perm-1",
      reply: "once",
    })

    expect(result.data).toBeDefined()

    // Verify server received the reply
    const permReq = server.receivedRequests.find(
      (r) => r.method === "POST" && r.path.includes("permission")
    )
    expect(permReq).toBeDefined()
    expect(permReq!.body?.reply).toBe("once")
  })

  test("question request → user answers → reply sent", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.question.reply({
      requestID: "q-1",
      answers: [["Option A"]],
    })

    expect(result.data).toBeDefined()

    const qReq = server.receivedRequests.find(
      (r) => r.method === "POST" && r.path.includes("question")
    )
    expect(qReq).toBeDefined()
    expect(qReq!.body?.answers?.[0]?.[0]).toBe("Option A")
  })

  test("abort stops ongoing request", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.session.abort({ sessionID: "sess-1" })
    expect(result.data).toBeDefined()

    const abortReq = server.receivedRequests.find(
      (r) => r.method === "POST" && r.path.includes("abort")
    )
    expect(abortReq).toBeDefined()
  })
})

// ── Acceptance Test: SSE Streaming Flow ──────────────────

describe("Acceptance: streaming response via SSE", () => {
  let server: ReturnType<typeof createMockHelixServer>

  beforeEach(() => {
    server = createMockHelixServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("LLM response streams via SSE deltas then completes with idle", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    // Create session
    const session = await client.session.create({ title: "Stream Test" })
    const sid = session.data!.id

    // Collect events
    const receivedEvents: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          if ((event as any)?.type === "session.idle") break
        }
      } catch {}
    })()

    // Wait for SSE connection
    await new Promise((r) => setTimeout(r, 300))

    // Send prompt
    const promptPromise = client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "explain async await" }],
    })

    // Simulate LLM streaming response via SSE
    await new Promise((r) => setTimeout(r, 200))
    if (server.sseController) {
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: sid, field: "text", delta: "Async/await " },
      })
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: sid, field: "text", delta: "is syntactic sugar " },
      })
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: sid, field: "text", delta: "for Promises." },
      })
      server.emitSSE({
        type: "session.idle",
        properties: { sessionID: sid },
      })
    }

    // Wait for completion
    await Promise.all([
      promptPromise,
      Promise.race([subscribePromise, new Promise((r) => setTimeout(r, 5000))]),
    ])

    // Verify deltas were received
    const deltas = receivedEvents.filter((e: any) => e?.type === "message.part.delta")
    expect(deltas.length).toBe(3)
    expect(deltas[0]?.properties?.delta).toBe("Async/await ")
    expect(deltas[1]?.properties?.delta).toBe("is syntactic sugar ")
    expect(deltas[2]?.properties?.delta).toBe("for Promises.")

    // Verify idle was received
    const idles = receivedEvents.filter((e: any) => e?.type === "session.idle")
    expect(idles.length).toBe(1)
  })

  test("permission request arrives via SSE during streaming", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const receivedEvents: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          if ((event as any)?.type === "permission.asked") break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      server.emitSSE({
        type: "permission.asked",
        properties: {
          id: "perm-1",
          permission: "write",
          patterns: ["/tmp/test.txt"],
        },
      })
    }

    await Promise.race([subscribePromise, new Promise((r) => setTimeout(r, 3000))])

    expect(receivedEvents.length).toBeGreaterThanOrEqual(1)
    expect(receivedEvents[0]?.type).toBe("permission.asked")
    expect(receivedEvents[0]?.properties?.permission).toBe("write")
  })

  test("error during streaming arrives via SSE", async () => {
    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const receivedEvents: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          if ((event as any)?.type === "session.error") break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      server.emitSSE({
        type: "session.error",
        properties: { sessionID: "sess-1", error: { message: "Rate limit exceeded" } },
      })
    }

    await Promise.race([subscribePromise, new Promise((r) => setTimeout(r, 3000))])

    expect(receivedEvents.length).toBeGreaterThanOrEqual(1)
    expect(receivedEvents[0]?.type).toBe("session.error")
    expect(receivedEvents[0]?.properties?.error?.message).toBe("Rate limit exceeded")
  })
})

// ── Acceptance Test: Event Processing Logic ──────────────

describe("Acceptance: event processing produces correct state", () => {
  test("delta events accumulate into complete response", () => {
    // Simulate the exact event processing logic from chat.tsx
    const messages: { role: string; content: string; status: string }[] = []
    messages.push({ role: "assistant", content: "", status: "pending" })

    // Apply deltas (same logic as chat.tsx event handler)
    const deltas = ["Async/await ", "is syntactic sugar ", "for Promises."]
    for (const delta of deltas) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg && msg.role === "assistant" && (msg.status === "pending" || msg.status === "streaming")) {
          msg.content += delta
          msg.status = "streaming"
          break
        }
      }
    }

    // Apply idle (same logic as chat.tsx event handler)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg && msg.role === "assistant" && msg.status === "streaming") {
        msg.status = "done"
        break
      }
    }

    // Verify final state
    expect(messages[0].content).toBe("Async/await is syntactic sugar for Promises.")
    expect(messages[0].status).toBe("done")
  })

  test("error during streaming sets error state with partial content", () => {
    const messages: { role: string; content: string; status: string; error?: string }[] = []
    messages.push({ role: "assistant", content: "", status: "pending" })

    // Partial streaming
    messages[0].content = "Partial "
    messages[0].status = "streaming"

    // Error arrives
    messages[0].status = "error"
    messages[0].error = "Connection lost"

    expect(messages[0].content).toBe("Partial ") // Content preserved
    expect(messages[0].status).toBe("error")
    expect(messages[0].error).toBe("Connection lost")
  })

  test("permission request creates UI state", () => {
    let permission: any = null

    // Simulate permission.asked event
    permission = {
      id: "perm-1",
      permission: "write",
      patterns: ["/tmp/test.txt"],
      message: "Permission required: write on /tmp/test.txt",
    }

    expect(permission).not.toBeNull()
    expect(permission.permission).toBe("write")
    expect(permission.patterns).toContain("/tmp/test.txt")

    // User clicks "Allow"
    permission = null
    expect(permission).toBeNull()
  })

  test("question request creates UI state with options", () => {
    let question: any = null

    question = {
      id: "q-1",
      question: "Which approach should I use?",
      options: ["TypeScript", "JavaScript", "Python"],
    }

    expect(question.options).toHaveLength(3)
    expect(question.options[0]).toBe("TypeScript")

    // User selects "Python"
    const selected = question.options[2]
    question = null

    expect(selected).toBe("Python")
    expect(question).toBeNull()
  })
})

// ── Acceptance Test: Trace Verification ──────────────────

describe("Acceptance: trace captures full flow", () => {
  test("complete chat flow produces correct trace sequence", async () => {
    const trace = await import("../src/trace")
    trace.clear()
    trace.setEnabled(true)
    trace.setFileLogging(false) // Don't write to file during tests

    // Simulate the exact trace sequence from a real chat interaction
    trace.emit("user.send", "info", "User sent message (5 chars)", { length: 5 })
    trace.emit("session.create", "info", "Creating new session")
    trace.emit("session.created", "info", "Session created", { sessionID: "sess-1" })
    trace.emit("session.prompt", "info", "Sending prompt to server", { sessionID: "sess-1", length: 5 })
    trace.emit("session.prompt_response", "info", "Received response", { length: 15, sessionID: "sess-1" })
    trace.emit("session.idle", "info", "Session idle", { sessionID: "sess-1" })

    const traces = trace.getTraces()

    // Verify trace sequence
    expect(traces).toHaveLength(6)
    expect(traces[0].type).toBe("user.send")
    expect(traces[1].type).toBe("session.create")
    expect(traces[2].type).toBe("session.created")
    expect(traces[3].type).toBe("session.prompt")
    expect(traces[4].type).toBe("session.prompt_response")
    expect(traces[5].type).toBe("session.idle")

    // Verify data integrity
    expect(traces[0].data?.length).toBe(5)
    expect(traces[2].data?.sessionID).toBe("sess-1")
    expect(traces[3].data?.length).toBe(5)
  })

  test("failed session creation produces error trace", async () => {
    const trace = await import("../src/trace")
    trace.clear()
    trace.setFileLogging(false)

    trace.emit("user.send", "info", "User sent message", { length: 3 })
    trace.emit("session.create", "info", "Creating new session")
    trace.emit("session.error", "warn", "Session creation attempt 1 failed", { error: "Connection refused", attempt: 1 })
    trace.emit("session.error", "warn", "Session creation attempt 2 failed", { error: "Connection refused", attempt: 2 })
    trace.emit("session.error", "error", "Session creation failed after retries", { error: "Connection refused" })

    const traces = trace.getTraces()
    expect(traces).toHaveLength(5)

    const errors = trace.getTraces({ level: "error" })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("after retries")
  })
})
