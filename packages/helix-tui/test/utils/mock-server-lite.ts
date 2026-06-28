/**
 * Standalone mock server for headless controller (no test runner dependencies).
 */

// ── Types ────────────────────────────────────────────────

export interface ScenarioBase {
  delay?: number
}

export interface DirectScenario extends ScenarioBase {
  type: "direct"
  response?: string
  status?: number
}

export interface StreamingScenario extends ScenarioBase {
  type: "streaming"
  chunks: string[]
  autoIdle?: boolean
}

export interface ErrorScenario extends ScenarioBase {
  type: "error"
  status?: number
  message?: string
  source?: "http" | "sse"
}

export interface ToolScenario extends ScenarioBase {
  type: "tool"
  toolName: string
  toolType: "read" | "write" | "edit" | "bash"
  status: "running" | "done" | "error"
  path?: string
  output?: string
}

export interface PermissionScenario extends ScenarioBase {
  type: "permission"
  requestID: string
  message: string
  scope: "project" | "shell" | "network" | "filesystem"
  urgency?: "low" | "medium" | "high"
}

export interface QuestionScenario extends ScenarioBase {
  type: "question"
  requestID: string
  question: string
  options: string[]
  multiSelect?: boolean
}

export interface CustomScenario extends ScenarioBase {
  type: "custom"
  events: Array<{ type: string; properties: Record<string, any>; delay?: number }>
}

export type Scenario =
  | DirectScenario
  | StreamingScenario
  | ErrorScenario
  | ToolScenario
  | PermissionScenario
  | QuestionScenario
  | CustomScenario

// ── Server State ─────────────────────────────────────────

interface ServerState {
  url: string
  stop: () => void
  restart: (scenario: Scenario) => Promise<void>
  sseController: ReadableStreamDefaultController | null
  emitSSE: (data: any) => boolean
  setScenario: (s: Scenario) => void
  receivedRequests: Array<{ method: string; path: string; body: any }>
  disconnectSSE: () => void
  waitForSSE: (timeoutMs?: number) => Promise<boolean>
}

// ── Factory ──────────────────────────────────────────────

export function createMockServer(): ServerState {
  let handler = defaultHandler
  let sseController: ReadableStreamDefaultController | null = null
  let currentScenario: Scenario | null = null
  const receivedRequests: Array<{ method: string; path: string; body: any }> = []
  let server: ReturnType<typeof Bun.serve>
  const pendingEvents: Array<{ type: string; properties: Record<string, any> }> = []

  function defaultHandler(): Response {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }

  async function buildResponse(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const body = req.method === "POST" ? await req.json().catch(() => null) : null
    receivedRequests.push({ method: req.method, path: url.pathname, body })

    if (url.pathname === "/event" || url.pathname === "/global/event") {
      const stream = new ReadableStream({
        start(controller) {
          sseController = controller
          enqueueSSE(controller, { type: "server.connected", properties: {} })
          for (const event of pendingEvents) {
            enqueueSSE(controller, event)
          }
          pendingEvents.length = 0
        },
        cancel() {
          sseController = null
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      })
    }

    if (url.pathname === "/global/health") {
      return Response.json({ status: "ok" })
    }

    if (url.pathname === "/session" && req.method === "POST") {
      return Response.json({ id: `sess-${Date.now()}`, title: body?.title ?? "Chat" })
    }

    if (url.pathname.match(/^\/session\/.*\/message$/) && req.method === "GET") {
      return Response.json([])
    }

    if (url.pathname.match(/^\/session\/.*\/message$/) && req.method === "POST") {
      const scenario = currentScenario
      if (!scenario) return Response.json({ error: "no scenario" }, { status: 500 })

      switch (scenario.type) {
        case "direct":
          return Response.json({ id: `msg-${Date.now()}`, parts: [{ type: "text", text: scenario.response ?? "OK" }] })
        case "streaming":
        case "error":
        case "tool":
        case "permission":
        case "question":
        case "custom":
          setTimeout(() => playScenario(scenario).catch(() => {}), 50)
          return Response.json({ id: `msg-${Date.now()}`, parts: [] })
      }
    }

    if (url.pathname.match(/^\/session\/.*\/abort$/)) {
      return Response.json({ success: true })
    }

    if (url.pathname.match(/^\/permission\/.*\/reply$/)) {
      return Response.json({ success: true })
    }

    if (url.pathname.match(/^\/question\/.*\/reply$/)) {
      return Response.json({ success: true })
    }

    return handler(req)
  }

  function enqueueSSE(controller: ReadableStreamDefaultController, data: { type: string; properties: Record<string, any> }) {
    try {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
      return true
    } catch {
      return false
    }
  }

  async function playScenario(scenario: Scenario) {
    const delay = scenario.delay ?? 50
    await new Promise((r) => setTimeout(r, 100))

    switch (scenario.type) {
      case "streaming":
        for (const chunk of scenario.chunks) {
          emitSSE({ type: "message.part.delta", properties: { field: "text", delta: chunk } })
          await new Promise((r) => setTimeout(r, delay))
        }
        if (scenario.autoIdle !== false) {
          emitSSE({ type: "session.idle", properties: {} })
        }
        break
      case "error":
        if (scenario.source === "sse") {
          emitSSE({ type: "session.error", properties: { error: { message: scenario.message ?? "Error" } } })
        }
        break
      case "tool":
        emitSSE({ type: "tool.call.start", properties: { name: scenario.toolName, type: scenario.toolType, path: scenario.path } })
        await new Promise((r) => setTimeout(r, delay))
        if (scenario.status === "done" && scenario.output) {
          emitSSE({ type: "tool.call.delta", properties: { content: scenario.output } })
          await new Promise((r) => setTimeout(r, delay))
        }
        emitSSE({ type: "tool.call.end", properties: { status: scenario.status } })
        break
      case "permission":
        emitSSE({ type: "permission.asked", properties: { requestID: scenario.requestID, message: scenario.message, scope: scenario.scope, urgency: scenario.urgency ?? "medium" } })
        break
      case "question":
        emitSSE({ type: "question.asked", properties: { id: scenario.requestID, requestID: scenario.requestID, question: scenario.question, options: scenario.options, multiSelect: scenario.multiSelect ?? false } })
        break
      case "custom":
        for (const event of scenario.events) {
          emitSSE({ type: event.type, properties: event.properties })
          await new Promise((r) => setTimeout(r, event.delay ?? delay))
        }
        break
      case "direct":
        break
    }
  }

  function emitSSE(data: { type: string; properties: Record<string, any> }): boolean {
    if (!sseController) {
      pendingEvents.push(data)
      return false
    }
    return enqueueSSE(sseController, data)
  }

  function disconnectSSE(): void {
    if (sseController) {
      try { sseController.close() } catch {}
      sseController = null
    }
  }

  async function waitForSSE(timeoutMs: number = 5000): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (sseController) return true
      await new Promise((r) => setTimeout(r, 50))
    }
    return false
  }

  let currentPort: number | null = null

  function startServer(port: number = 0): number {
    server = Bun.serve({ port, fetch: buildResponse, idleTimeout: 120 })
    currentPort = server.port
    return server.port
  }

  async function start(scenario: Scenario): Promise<string> {
    currentScenario = scenario
    const port = startServer()
    const url = `http://localhost:${port}`
    let ready = false
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(`${url}/global/health`)
        if (res.ok) { ready = true; break }
      } catch {}
      await new Promise((r) => setTimeout(r, 50))
    }
    if (!ready) throw new Error("Mock server failed to start")
    if (scenario.type === "direct") playScenario(scenario).catch(() => {})
    return url
  }

  async function restart(scenario: Scenario): Promise<string> {
    stop()
    return start(scenario)
  }

  function stop(): void {
    disconnectSSE()
    try { server.stop() } catch {}
    currentPort = null
  }

  return {
    get url() { return currentPort ? `http://localhost:${currentPort}` : "" },
    start,
    stop,
    restart: async (s: Scenario) => restart(s),
    get sseController() { return sseController },
    emitSSE,
    setScenario: (s: Scenario) => { currentScenario = s; playScenario(s).catch(() => {}) },
    receivedRequests,
    disconnectSSE,
    waitForSSE,
  }
}

export function createMockFetch(server: ReturnType<typeof createMockServer>): typeof fetch {
  const serverUrl = server.url
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    const parsed = new URL(url, "http://mock-server")
    const targetUrl = serverUrl + parsed.pathname + parsed.search
    return fetch(targetUrl, init)
  }
}
