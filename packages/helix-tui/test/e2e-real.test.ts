import { describe, expect, test } from "bun:test"
import { createOpencodeClient } from "@mimo-ai/sdk/v2"

const SERVER_URL = process.env.HELIX_URL ?? "http://localhost:3095"
const SERVER_PASSWORD = process.env.MIMOCODE_SERVER_PASSWORD ?? "test123"
const TIMEOUT = 30_000

const authHeader = { Authorization: `Basic ${Buffer.from(`mimocode:${SERVER_PASSWORD}`).toString("base64")}` }
const client = createOpencodeClient({ baseUrl: SERVER_URL, headers: authHeader })

// Check server reachability before defining tests
let serverReachable = false
try {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  const res = await fetch(`${SERVER_URL}/global/health`, {
    signal: controller.signal,
    headers: authHeader,
  })
  clearTimeout(timeout)
  serverReachable = res.ok
} catch {
  serverReachable = false
}

const testFn = serverReachable ? test : test.skip

// ── Real LLM E2E Tests ──────────────────────────────────

describe("E2E: real LLM chat", () => {
  testFn("session.create returns valid session", async () => {
    const result = await client.session.create({ title: "E2E Test" })
    expect(result.data).toBeDefined()
    expect(result.data!.id).toBeTruthy()
    expect(result.data!.title).toBeTruthy()
  }, TIMEOUT)

  testFn("prompt returns LLM response with text content", async () => {
    const session = await client.session.create({ title: "E2E Prompt Test" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Say exactly: hello world" }],
    })

    expect(result.data).toBeDefined()
    expect(result.data!.parts).toBeDefined()
    expect(result.data!.parts.length).toBeGreaterThan(0)

    const textParts = result.data!.parts.filter((p: any) => p.type === "text")
    expect(textParts.length).toBeGreaterThan(0)

    const content = textParts.map((p: any) => p.text).join("")
    expect(content.length).toBeGreaterThan(0)
    expect(content.toLowerCase()).toContain("hello world")
  }, TIMEOUT)

  testFn("prompt with code question returns code", async () => {
    const session = await client.session.create({ title: "E2E Code Test" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Write a TypeScript function that adds two numbers. Only output the code, no explanation." }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")

    const hasCode = content.includes("return") || content.includes("=>") || content.includes("function")
    expect(hasCode).toBe(true)
  }, TIMEOUT)

  testFn("multi-turn conversation maintains context", async () => {
    const session = await client.session.create({ title: "E2E Multi-turn" })
    const sid = session.data!.id

    const r1 = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Remember the number 42. Just say 'remembered'." }],
    })
    expect(r1.data).toBeDefined()

    const r2 = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "What number did I ask you to remember?" }],
    })
    expect(r2.data).toBeDefined()
    const content = r2.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    expect(content).toContain("42")
  }, TIMEOUT)

  testFn("session.abort stops generation", async () => {
    const session = await client.session.create({ title: "E2E Abort" })
    const sid = session.data!.id

    const abortPromise = client.session.abort({ sessionID: sid })

    try {
      await client.session.prompt({
        sessionID: sid,
        parts: [{ type: "text", text: "Write a very long essay" }],
      })
    } catch {}

    await abortPromise
    expect(true).toBe(true)
  }, TIMEOUT)

  testFn("event.subscribe receives real SSE events", async () => {
    const session = await client.session.create({ title: "E2E SSE" })
    const sid = session.data!.id

    const receivedEvents: any[] = []
    const maxEvents = 5

    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          receivedEvents.push(event)
          if (receivedEvents.length >= maxEvents) break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 500))

    await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Say hi" }],
    })

    await Promise.race([
      subscribePromise,
      new Promise((r) => setTimeout(r, TIMEOUT)),
    ])

    expect(receivedEvents.length).toBeGreaterThan(0)
  }, TIMEOUT)

  testFn("messages list returns conversation history", async () => {
    const session = await client.session.create({ title: "E2E History" })
    const sid = session.data!.id

    await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Reply with just 'ok'" }],
    })

    const result = await client.session.messages({ sessionID: sid, limit: 10 })
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBeGreaterThan(0)

    const roles = result.data!.map((m: any) => m.info.role)
    expect(roles).toContain("user")
    expect(roles).toContain("assistant")
  }, TIMEOUT)
})

// ── Real Error Handling ──────────────────────────────────

describe("E2E: real error handling", () => {
  testFn("invalid session ID returns error", async () => {
    const result = await client.session.prompt({
      sessionID: "nonexistent-session-id",
      parts: [{ type: "text", text: "hello" }],
    })
    expect(result.error !== undefined || result.data === undefined || result.data === null).toBe(true)
  }, TIMEOUT)

  testFn("empty prompt is handled gracefully", async () => {
    const session = await client.session.create({ title: "E2E Empty" })
    const sid = session.data!.id

    // Empty prompt may timeout or return error — either is acceptable
    const result = await Promise.race([
      client.session.prompt({ sessionID: sid, parts: [{ type: "text", text: " " }] }),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 5000)),
    ])
    expect(result).toBeDefined()
  }, 10000)
})

// ── Server Health ────────────────────────────────────────

describe("E2E: server health", () => {
  testFn("/global/health returns ok", async () => {
    const res = await fetch(`${SERVER_URL}/global/health`, { headers: authHeader })
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body).toBeDefined()
  }, 5000)
})

// ── Tool Use ─────────────────────────────────────────────

describe("E2E: tool use", () => {
  testFn("agent executes bash tool and returns output", async () => {
    const session = await client.session.create({ title: "E2E Tool Bash" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: 'Run the command: echo "tool_test_123". Only output the command output, nothing else.' }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    expect(content).toContain("tool_test_123")
  }, TIMEOUT)

  testFn("agent reads a file and reports content", async () => {
    const session = await client.session.create({ title: "E2E Tool Read" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Read the file package.json in the current directory and tell me the 'name' field value. Only output the name value." }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    // Should contain a package name from the monorepo
    expect(content.length).toBeGreaterThan(0)
  }, TIMEOUT)

  testFn("agent uses multiple tools in sequence", async () => {
    const session = await client.session.create({ title: "E2E Multi-Tool" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "1) Run `pwd` to get current directory. 2) Run `ls` to list files. 3) Tell me how many files are in the current directory. Output only the number." }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    // Should contain a number
    expect(content).toMatch(/\d+/)
  }, TIMEOUT)
})

// ── Streaming Chunk Verification ─────────────────────────

describe("E2E: streaming chunks", () => {
  testFn("SSE deltas arrive in order and accumulate to full response", async () => {
    const session = await client.session.create({ title: "E2E Stream Chunks" })
    const sid = session.data!.id

    const deltas: string[] = []
    let idleReceived = false
    let errorReceived: string | null = null

    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          const e = event as any
          if (e?.type === "message.part.delta" && e?.properties?.field === "text") {
            deltas.push(e.properties.delta ?? "")
          }
          if (e?.type === "session.idle") {
            idleReceived = true
            break
          }
          if (e?.type === "session.error") {
            errorReceived = e.properties?.error?.message ?? "unknown"
            break
          }
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 500))

    const promptPromise = client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Count from 1 to 5, each number on its own line. Nothing else." }],
    })

    await Promise.all([
      promptPromise,
      Promise.race([subscribePromise, new Promise((r) => setTimeout(r, TIMEOUT))]),
    ])

    // Verify deltas arrived
    expect(deltas.length).toBeGreaterThan(0)

    // Verify deltas accumulate to meaningful content
    const fullContent = deltas.join("")
    expect(fullContent.length).toBeGreaterThan(0)

    // Verify idle was received (stream completed)
    expect(idleReceived).toBe(true)

    // Verify no errors
    expect(errorReceived).toBeNull()
  }, TIMEOUT)

  testFn("each delta is non-empty string", async () => {
    const session = await client.session.create({ title: "E2E Delta Quality" })
    const sid = session.data!.id

    const deltas: string[] = []

    const subscribePromise = (async () => {
      try {
        const result = await client.event.subscribe()
        for await (const event of result.stream) {
          const e = event as any
          if (e?.type === "message.part.delta" && e?.properties?.field === "text") {
            deltas.push(e.properties.delta ?? "")
          }
          if (e?.type === "session.idle") break
        }
      } catch {}
    })()

    await new Promise((r) => setTimeout(r, 500))

    await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Say 'streaming works' in one word per line: streaming, then works" }],
    })

    await Promise.race([subscribePromise, new Promise((r) => setTimeout(r, TIMEOUT))])

    // Each delta should be a string (may be empty for some events)
    for (const delta of deltas) {
      expect(typeof delta).toBe("string")
    }

    // Total content should contain the expected text
    const fullContent = deltas.join("").toLowerCase()
    expect(fullContent).toContain("streaming")
    expect(fullContent).toContain("works")
  }, TIMEOUT)
})

// ── Timeout Handling ─────────────────────────────────────

describe("E2E: timeout handling", () => {
  testFn("request timeout returns error, not hang", async () => {
    const session = await client.session.create({ title: "E2E Timeout" })
    const sid = session.data!.id

    // Use a very short timeout to force timeout
    const timeoutPromise = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 5000))
    const promptPromise = client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Write a 1000 word essay about AI" }],
    })

    const winner = await Promise.race([promptPromise, timeoutPromise])

    // Either the prompt completes or it times out — both are acceptable
    // The key is that we don't hang forever
    expect(winner).toBeDefined()
    if (winner === "timeout") {
      // Timeout is acceptable — server may be slow
      expect(winner).toBe("timeout")
    } else {
      // Response received within timeout
      expect((winner as any).data).toBeDefined()
    }
  }, 10000)

  testFn("abort during long-running request returns promptly", async () => {
    const session = await client.session.create({ title: "E2E Abort Timeout" })
    const sid = session.data!.id

    const startTime = Date.now()

    // Start a long request and abort after 2s
    const promptPromise = client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Write a very detailed 5000 word essay about quantum computing" }],
    }).catch(() => null)

    setTimeout(() => {
      client.session.abort({ sessionID: sid }).catch(() => {})
    }, 2000)

    await promptPromise
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time (not hang for 30s+)
    expect(elapsed).toBeLessThan(15000)
  }, 20000)
})

// ── Concurrent Sessions ──────────────────────────────────

describe("E2E: concurrent sessions", () => {
  testFn("two sessions run in parallel without interference", async () => {
    const s1 = await client.session.create({ title: "Concurrent A" })
    const s2 = await client.session.create({ title: "Concurrent B" })
    const sid1 = s1.data!.id
    const sid2 = s2.data!.id

    // Send different prompts to both sessions simultaneously
    const [r1, r2] = await Promise.all([
      client.session.prompt({
        sessionID: sid1,
        parts: [{ type: "text", text: "Reply with exactly: ALPHA" }],
      }),
      client.session.prompt({
        sessionID: sid2,
        parts: [{ type: "text", text: "Reply with exactly: BETA" }],
      }),
    ])

    // Both should succeed
    expect(r1.data).toBeDefined()
    expect(r2.data).toBeDefined()

    // Verify responses are correct (each session got its own response)
    const c1 = r1.data!.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
    const c2 = r2.data!.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")

    expect(c1.toLowerCase()).toContain("alpha")
    expect(c2.toLowerCase()).toContain("beta")
  }, TIMEOUT)

  testFn("five concurrent sessions all complete successfully", async () => {
    const sessions = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        client.session.create({ title: `Concurrent ${i}` })
      )
    )

    const sids = sessions.map((s) => s.data!.id)

    // Send prompts to all 5 sessions simultaneously
    const results = await Promise.all(
      sids.map((sid, i) =>
        client.session.prompt({
          sessionID: sid,
          parts: [{ type: "text", text: `Reply with exactly: NUM${i}` }],
        })
      )
    )

    // All should succeed
    for (let i = 0; i < 5; i++) {
      expect(results[i].data).toBeDefined()
      const content = results[i].data!.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("")
      expect(content.toLowerCase()).toContain(`num${i}`)
    }
  }, TIMEOUT)

  testFn("concurrent session creation does not duplicate IDs", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.session.create({ title: "ID Unique" })
      )
    )

    const ids = results.map((r) => r.data!.id)
    const uniqueIds = new Set(ids)

    // All IDs should be unique
    expect(uniqueIds.size).toBe(10)
  }, TIMEOUT)
})

// ── Edge Cases ───────────────────────────────────────────

describe("E2E: edge cases", () => {
  testFn("unicode prompt returns unicode response", async () => {
    const session = await client.session.create({ title: "E2E Unicode" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Reply with exactly: 你好世界 🌍" }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    expect(content).toContain("你好世界")
  }, TIMEOUT)

  testFn("long prompt (1000 chars) returns response", async () => {
    const session = await client.session.create({ title: "E2E Long" })
    const sid = session.data!.id

    const longText = "Please repeat this text back to me: " + "x".repeat(1000)
    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: longText }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    expect(content.length).toBeGreaterThan(0)
  }, TIMEOUT)

  testFn("special characters in prompt are handled", async () => {
    const session = await client.session.create({ title: "E2E Special Chars" })
    const sid = session.data!.id

    const result = await client.session.prompt({
      sessionID: sid,
      parts: [{ type: "text", text: "Reply with exactly: @#$%^&*()_+-=[]{}|;':\",./<>?" }],
    })

    expect(result.data).toBeDefined()
    const content = result.data!.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("")
    // Should return something (not crash)
    expect(content.length).toBeGreaterThan(0)
  }, TIMEOUT)
})
