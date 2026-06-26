import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session as SessionNs } from "../../src/session"
import { SessionRunState } from "../../src/session/run-state"
import { AppRuntime } from "../../src/effect/app-runtime"
import { Log } from "../../src/util"
import { tmpdir } from "../fixture/fixture"

void Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
})

describe("E2E: Message and Streaming Response", () => {
  test("POST /session creates a session with valid ID", async () => {
    await using tmp = await tmpdir({ git: true })

    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

        const res = await app.request(`/session${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "E2E Stream Test" }),
        })

        expect(res.status).toBe(200)
        const session = (await res.json()) as { id: string }
        expect(session.id).toBeTruthy()
        expect(session.id).toMatch(/^ses_/)

        return session
      },
    })

    expect(result.id).toBeTruthy()
  })

  test("POST /session/:id/message returns streaming response", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

        const createRes = await app.request(`/session${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Streaming Test" }),
        })
        const session = (await createRes.json()) as { id: string }

        const msgRes = await app.request(`/session/${session.id}/message${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text: "Hello, test message" }],
          }),
        })

        expect(msgRes.status).toBe(200)
        expect(msgRes.headers.get("content-type")).toContain("application/json")

        const body = await msgRes.text()
        expect(body.length).toBeGreaterThan(0)

        const parsed = JSON.parse(body)
        if (parsed.error) {
          expect(parsed.error).not.toContain("409")
        }
      },
    })
  })

  test("POST /session/:id/message with invalid JSON returns error", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

        const createRes = await app.request(`/session${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Validation Test" }),
        })
        const session = (await createRes.json()) as { id: string }

        const msgRes = await app.request(`/session/${session.id}/message${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        })

        expect(msgRes.status).toBeGreaterThanOrEqual(400)
      },
    })
  })

  test("POST /session/:id/message returns 409 when runner is busy", async () => {
    await using tmp = await tmpdir({ git: true })

    const status = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        AppRuntime.runPromise(
          Effect.gen(function* () {
            const sessions = yield* SessionNs.Service
            const sess = yield* sessions.create({ title: "busy-stream-test" })
            const state = yield* SessionRunState.Service

            yield* state
              .startShell(
                sess.id,
                Effect.succeed({ info: {}, parts: [] } as never),
                Effect.never as never,
              )
              .pipe(Effect.forkChild)

            yield* Effect.sleep("50 millis")

            const app = Server.Default().app
            const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

            const res = yield* Effect.promise(async () =>
              app.request(`/session/${sess.id}/message${dirQuery}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  parts: [{ type: "text", text: "should be rejected" }],
                }),
              }),
            )

            yield* state.cancel(sess.id)
            return res.status
          }),
        ),
    })

    expect(status).toBe(409)
  })

  test("POST /session/:id/abort frees runner for new messages", async () => {
    await using tmp = await tmpdir({ git: true })

    const result = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        AppRuntime.runPromise(
          Effect.gen(function* () {
            const sessions = yield* SessionNs.Service
            const sess = yield* sessions.create({ title: "abort-recover-test" })
            const state = yield* SessionRunState.Service

            yield* state
              .startShell(
                sess.id,
                Effect.succeed({ info: {}, parts: [] } as never),
                Effect.never as never,
              )
              .pipe(Effect.forkChild)
            yield* Effect.sleep("50 millis")

            const app = Server.Default().app
            const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

            const first = yield* Effect.promise(async () =>
              app.request(`/session/${sess.id}/message${dirQuery}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parts: [{ type: "text", text: "first" }] }),
              }),
            )

            const abort = yield* Effect.promise(async () =>
              app.request(`/session/${sess.id}/abort${dirQuery}`, { method: "POST" }),
            )

            yield* Effect.sleep("100 millis")

            const second = yield* Effect.promise(async () =>
              app.request(`/session/${sess.id}/message${dirQuery}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parts: [{ type: "text", text: "second" }] }),
              }),
            )

            return {
              firstStatus: first.status,
              abortStatus: abort.status,
              secondStatus: second.status,
            }
          }),
        ),
    })

    expect(result.firstStatus).toBe(409)
    expect(result.abortStatus).toBe(200)
    expect(result.secondStatus).not.toBe(409)
  })

  test("GET /event returns SSE stream with connected event", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)

        try {
          const res = await app.request(`/event${dirQuery}`, {
            signal: controller.signal,
          })

          expect(res.status).toBe(200)
          expect(res.headers.get("content-type")).toContain("text/event-stream")
          expect(res.headers.get("cache-control")).toContain("no-cache")

          const reader = res.body?.getReader()
          expect(reader).toBeTruthy()

          if (reader) {
            const decoder = new TextDecoder()
            const { value } = await reader.read()
            const chunk = decoder.decode(value)

            expect(chunk).toContain("data:")
            expect(chunk).toContain("server.connected")

            reader.cancel()
          }
        } finally {
          clearTimeout(timeout)
        }
      },
    })
  })

  test("GET /global/health returns healthy status", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app

        const res = await app.request("/global/health")
        expect(res.status).toBe(200)

        const health = (await res.json()) as { healthy: boolean; version: string }
        expect(health.healthy).toBe(true)
        expect(health.version).toBeTruthy()
      },
    })
  })

  test("POST /session/:id/prompt_async returns 204 immediately", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const dirQuery = `?directory=${encodeURIComponent(tmp.path)}`

        const createRes = await app.request(`/session${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Async Prompt Test" }),
        })
        const session = (await createRes.json()) as { id: string }

        const msgRes = await app.request(`/session/${session.id}/prompt_async${dirQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts: [{ type: "text", text: "async hello" }],
          }),
        })

        expect(msgRes.status).toBe(204)
      },
    })
  })

  test("GET /global/event returns SSE stream", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)

        try {
          const res = await app.request("/global/event", {
            signal: controller.signal,
          })

          expect(res.status).toBe(200)
          expect(res.headers.get("content-type")).toContain("text/event-stream")

          const reader = res.body?.getReader()
          expect(reader).toBeTruthy()

          if (reader) {
            const decoder = new TextDecoder()
            const { value } = await reader.read()
            const chunk = decoder.decode(value)

            expect(chunk).toContain("data:")
            expect(chunk).toContain("server.connected")

            reader.cancel()
          }
        } finally {
          clearTimeout(timeout)
        }
      },
    })
  })
})
