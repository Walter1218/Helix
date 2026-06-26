import { Bus } from "../../../opencode/src/bus"

export function createRealBusServer() {
  const encoder = new TextEncoder()

  const server = Bun.serve({
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname

      // SSE event stream — events come from real Bus.subscribeAll
      if (path === "/event") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "server.connected", properties: {} })}
\n\n`,
                ),
              )

              const unsub = Bus.subscribeAll((event) => {
                try {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                  )
                } catch {
                  // stream closed
                }
              })

              req.signal.addEventListener("abort", () => {
                unsub()
                try {
                  controller.close()
                } catch {}
              })
            },
          }),
          {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
              "x-accel-buffering": "no",
              "x-content-type-options": "nosniff",
            },
          },
        )
      }

      // Health check
      if (path === "/global/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "content-type": "application/json" },
        })
      }

      // Session create
      if (path === "/session" && req.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: "test-session",
              title: "Test Session",
              status: "active",
              time: { created: Date.now() },
            },
          }),
          { headers: { "content-type": "application/json" } },
        )
      }

      // Session list
      if (path === "/session" && req.method === "GET") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "test-session",
                title: "Test Session",
                status: "active",
                time: { created: Date.now() },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        )
      }

      // Session messages
      if (path.match(/\/session\/[^/]+\/messages/) && req.method === "GET") {
        return new Response(JSON.stringify({ data: [] }), {
          headers: { "content-type": "application/json" },
        })
      }

      // Session message send
      if (path.match(/\/session\/[^/]+\/message/) && req.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: "msg-" + Math.random().toString(36).slice(2),
              parts: [{ type: "text", text: "OK" }],
            },
          }),
          { headers: { "content-type": "application/json" } },
        )
      }

      // Default
      return new Response(JSON.stringify({ data: {} }), {
        headers: { "content-type": "application/json" },
      })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(),
  }
}
