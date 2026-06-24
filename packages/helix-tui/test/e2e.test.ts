import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"

// ── Mock HTTP Server ─────────────────────────────────────

type MockHandler = (req: Request) => Response | Promise<Response>

interface MockServer {
  url: string
  stop: () => void
  sseController: ReadableStreamDefaultController | null
  emitSSE: (data: any) => void
  setHandler: (h: MockHandler) => void
}

function createMockServer(): MockServer {
  let handler: MockHandler = () => new Response("not found", { status: 404 })
  let sseController: ReadableStreamDefaultController | null = null

  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url)

      // SSE endpoint
      if (url.pathname === "/global/event" || url.pathname === "/event") {
        const stream = new ReadableStream({
          start(controller) {
            sseController = controller
          },
          cancel() {
            sseController = null
          },
        })
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        })
      }

      return handler(req)
    },
  })

  const port = server.port

  return {
    url: `http://localhost:${port}`,
    stop: () => server.stop(),
    get sseController() { return sseController },
    emitSSE: (data: any) => {
      if (sseController) {
        sseController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
      }
    },
    setHandler: (h: MockHandler) => { handler = h },
  }
}

// ── E2E: SDK Client ↔ Mock Server ────────────────────────

describe("E2E: SDK client integration", () => {
  let server: MockServer

  beforeEach(() => {
    server = createMockServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("session.create → POST /session → returns session", async () => {
    let receivedBody: any = null

    server.setHandler(async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/session" && req.method === "POST") {
        receivedBody = await req.json()
        return Response.json({ id: "sess-1", title: receivedBody.title })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.session.create({ title: "Test Chat" })
    expect(result.data?.id).toBe("sess-1")
    expect(receivedBody?.title).toBe("Test Chat")
  })

  test("session.prompt → POST /session/{id}/message → returns response", async () => {
    let receivedBody: any = null

    server.setHandler(async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/session/sess-1/message" && req.method === "POST") {
        receivedBody = await req.json()
        return Response.json({
          id: "sess-1",
          parts: [{ type: "text", text: `Echo: ${receivedBody?.parts?.[0]?.text}` }],
        })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.session.prompt({
      sessionID: "sess-1",
      parts: [{ type: "text", text: "hello" }],
    })

    expect(result.data?.parts?.[0]?.text).toBe("Echo: hello")
    expect(receivedBody?.parts?.[0]?.text).toBe("hello")
  })

  test("session.abort → POST /session/{id}/abort", async () => {
    let abortReceived = false

    server.setHandler(async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/session/sess-1/abort") {
        abortReceived = true
        return Response.json({ success: true })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    await client.session.abort({ sessionID: "sess-1" })
    expect(abortReceived).toBe(true)
  })

  test("permission.reply → POST /permission/{id}/reply", async () => {
    let receivedBody: any = null

    server.setHandler(async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/permission/perm-1/reply") {
        receivedBody = await req.json()
        return Response.json({ success: true })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    await client.permission.reply({ requestID: "perm-1", reply: "once" })
    expect(receivedBody?.reply).toBe("once")
  })

  test("question.reply → POST /question/{id}/reply", async () => {
    let receivedBody: any = null

    server.setHandler(async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/question/q-1/reply") {
        receivedBody = await req.json()
        return Response.json({ success: true })
      }
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    await client.question.reply({ requestID: "q-1", answers: [["Option A"]] })
    expect(receivedBody?.answers?.[0]?.[0]).toBe("Option A")
  })

  test("event.subscribe → GET /global/event → receives SSE", async () => {
    const receivedEvents: any[] = []

    server.setHandler(async () => {
      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          if (receivedEvents.length >= 3) break
        }
      } catch {}
    })()

    // Wait for SSE connection
    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      server.emitSSE({ type: "test.1", properties: { data: "a" } })
      server.emitSSE({ type: "test.2", properties: { data: "b" } })
      server.emitSSE({ type: "test.3", properties: { data: "c" } })
    }

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, 3000)),
    ])

    expect(receivedEvents.length).toBeGreaterThanOrEqual(1)
  })
})

// ── E2E: Server Error Handling ───────────────────────────

describe("E2E: server errors", () => {
  let server: MockServer

  beforeEach(() => {
    server = createMockServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("500 on session.create returns error", async () => {
    server.setHandler(async () => {
      return Response.json({ error: "Internal server error" }, { status: 500 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.session.create({ title: "Test" })
    expect(result.error).toBeDefined()
  })

  test("503 on prompt returns error", async () => {
    server.setHandler(async () => {
      return Response.json({ error: "Service unavailable" }, { status: 503 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const result = await client.session.prompt({
      sessionID: "sess-1",
      parts: [{ type: "text", text: "hi" }],
    })
    expect(result.error).toBeDefined()
  })

  test("404 on abort is handled gracefully", async () => {
    server.setHandler(async () => {
      return Response.json({ error: "Not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    // Should not throw
    const result = await client.session.abort({ sessionID: "nonexistent" })
    expect(result).toBeDefined()
  })
})

// ── E2E: SSE Event Processing ────────────────────────────

describe("E2E: SSE event processing", () => {
  let server: MockServer

  beforeEach(() => {
    server = createMockServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("message.part.delta → content accumulates", async () => {
    server.setHandler(async () => Response.json({ error: "not found" }, { status: 404 }))

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const events: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          events.push(event)
          if (events.length >= 4) break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      // Simulate streaming a response
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: "s1", field: "text", delta: "function " },
      })
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: "s1", field: "text", delta: "hello() {" },
      })
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: "s1", field: "text", delta: "}" },
      })
      server.emitSSE({
        type: "session.idle",
        properties: { sessionID: "s1" },
      })
    }

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, 3000)),
    ])

    expect(events.length).toBeGreaterThanOrEqual(3)

    // Verify delta content
    const deltas = events.filter((e: any) => e?.type === "message.part.delta")
    expect(deltas.length).toBe(3)
    expect(deltas[0]?.properties?.delta).toBe("function ")
    expect(deltas[1]?.properties?.delta).toBe("hello() {")
    expect(deltas[2]?.properties?.delta).toBe("}")
  })

  test("session.error → error event received", async () => {
    server.setHandler(async () => Response.json({ error: "not found" }, { status: 404 }))

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const events: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          events.push(event)
          if (events.length >= 1) break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      server.emitSSE({
        type: "session.error",
        properties: { sessionID: "s1", error: { message: "Agent crashed" } },
      })
    }

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, 3000)),
    ])

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]?.type).toBe("session.error")
    expect(events[0]?.properties?.error?.message).toBe("Agent crashed")
  })

  test("permission.asked → permission event received", async () => {
    server.setHandler(async () => Response.json({ error: "not found" }, { status: 404 }))

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const events: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          events.push(event)
          if (events.length >= 1) break
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

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, 3000)),
    ])

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]?.type).toBe("permission.asked")
    expect(events[0]?.properties?.permission).toBe("write")
  })

  test("question.asked → question event received", async () => {
    server.setHandler(async () => Response.json({ error: "not found" }, { status: 404 }))

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    const events: any[] = []
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          events.push(event)
          if (events.length >= 1) break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    if (server.sseController) {
      server.emitSSE({
        type: "question.asked",
        properties: {
          id: "q-1",
          question: "Which file?",
          options: ["a.ts", "b.ts"],
        },
      })
    }

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, 3000)),
    ])

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]?.type).toBe("question.asked")
    expect(events[0]?.properties?.options).toEqual(["a.ts", "b.ts"])
  })
})

// ── E2E: Full Flow Simulation ────────────────────────────

describe("E2E: full flow simulation", () => {
  let server: MockServer

  beforeEach(() => {
    server = createMockServer()
  })

  afterEach(() => {
    server.stop()
  })

  test("create → prompt → delta stream → idle", async () => {
    const receivedEvents: any[] = []

    server.setHandler(async (req) => {
      const url = new URL(req.url)

      if (url.pathname === "/session" && req.method === "POST") {
        return Response.json({ id: "sess-1", title: "Test" })
      }

      if (url.pathname === "/session/sess-1/message" && req.method === "POST") {
        return Response.json({ id: "sess-1", parts: [{ type: "text", text: "" }] })
      }

      if (url.pathname === "/session/sess-1/message") {
        return Response.json([])
      }

      return Response.json({ error: "not found" }, { status: 404 })
    })

    const { createOpencodeClient } = await import("@mimo-ai/sdk/v2")
    const client = createOpencodeClient({ baseUrl: server.url })

    // 1. Create session
    const session = await client.session.create({ title: "Test" })
    expect(session.data?.id).toBe("sess-1")

    // 2. Start event subscription
    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          // Stop after idle
          if ((event as any)?.type === "session.idle") break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 300))

    // 3. Send prompt
    const promptPromise = client.session.prompt({
      sessionID: "sess-1",
      parts: [{ type: "text", text: "Write code" }],
    })

    // 4. Stream response via SSE
    await new Promise((r) => setTimeout(r, 200))
    if (server.sseController) {
      server.emitSSE({
        type: "message.part.delta",
        properties: { sessionID: "sess-1", field: "text", delta: "const x = 1" },
      })
      server.emitSSE({
        type: "session.idle",
        properties: { sessionID: "sess-1" },
      })
    }

    // 5. Wait for completion
    const [promptResult] = await Promise.all([
      promptPromise,
      Promise.race([subscribePromise, new Promise((r) => setTimeout(r, 5000))]),
    ])

    expect(promptResult.data).toBeDefined()

    // Verify events received
    const deltas = receivedEvents.filter((e: any) => e?.type === "message.part.delta")
    const idles = receivedEvents.filter((e: any) => e?.type === "session.idle")
    expect(deltas.length).toBeGreaterThanOrEqual(1)
    expect(idles.length).toBeGreaterThanOrEqual(1)
    expect(deltas[0]?.properties?.delta).toBe("const x = 1")
  })
})
