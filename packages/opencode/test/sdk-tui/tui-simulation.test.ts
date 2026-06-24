import { afterEach, describe, expect } from "bun:test"
import { Effect, Exit, Layer, Scope, Fiber } from "effect"
import { Bus } from "../../src/bus"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Log } from "../../src/util"

void Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
})

const bus = Bus.layer
const env = Layer.mergeAll(Permission.layer.pipe(Layer.provide(bus)), bus, CrossSpawnSpawner.defaultLayer)
const it = testEffect(env)

function buildRequest(extra?: Partial<Parameters<Permission.Interface["ask"]>[0]>) {
  return {
    permission: "edit" as never,
    patterns: ["/some/never-allowed-path"],
    always: ["*"],
    metadata: {},
    sessionID: "ses_test" as never,
    ruleset: [],
    tool: { messageID: "msg_test" as never, callID: "call_test" },
    ...extra,
  }
}

// ==================== Permission Auto-Approval ====================

describe("TUI Permission Auto-Approval", () => {
  it.live(
    "interactive:false auto-approves without asking",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const result = yield* perm.ask(buildRequest({ interactive: false })).pipe(Effect.exit)
        expect(result._tag).toBe("Success")
        const pending = yield* perm.list()
        expect(pending.length).toBe(0)
      }),
    ),
  )

  it.live(
    "MIMOCODE_AUTONOMOUS=1 auto-approves",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const prev = process.env.MIMOCODE_AUTONOMOUS
        process.env.MIMOCODE_AUTONOMOUS = "1"
        try {
          const perm = yield* Permission.Service
          const result = yield* perm.ask(buildRequest()).pipe(Effect.exit)
          expect(result._tag).toBe("Success")
        } finally {
          if (prev === undefined) delete process.env.MIMOCODE_AUTONOMOUS
          else process.env.MIMOCODE_AUTONOMOUS = prev
        }
      }),
    ),
  )
})

// ==================== Permission Ruleset Evaluation ====================

describe("TUI Permission Ruleset Evaluation", () => {
  it.live(
    "deny rule rejects immediately",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const result = yield* perm
          .ask(buildRequest({ ruleset: [{ permission: "edit", pattern: "*", action: "deny" }] }))
          .pipe(Effect.exit)
        expect(result._tag).toBe("Failure")
      }),
    ),
  )

  it.live(
    "allow rule skips asking",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const result = yield* perm
          .ask(buildRequest({ ruleset: [{ permission: "edit", pattern: "*", action: "allow" }] }))
          .pipe(Effect.exit)
        expect(result._tag).toBe("Success")
      }),
    ),
  )

  it.live(
    "wildcard pattern match allows correctly",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const result = yield* perm
          .ask(
            buildRequest({
              patterns: ["/src/test.ts"],
              ruleset: [{ permission: "edit", pattern: "/src/*", action: "allow" }],
            }),
          )
          .pipe(Effect.exit)
        expect(result._tag).toBe("Success")
      }),
    ),
  )

  it.live(
    "exact pattern match",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const result = yield* perm
          .ask(
            buildRequest({
              permission: "bash" as never,
              patterns: ["npm test"],
              ruleset: [{ permission: "bash", pattern: "npm test", action: "allow" }],
            }),
          )
          .pipe(Effect.exit)
        expect(result._tag).toBe("Success")
      }),
    ),
  )

  it.live(
    "mixed ruleset: allow src, deny etc",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const denyResult = yield* perm
          .ask(
            buildRequest({
              patterns: ["/etc/passwd"],
              ruleset: [
                { permission: "edit", pattern: "/src/*", action: "allow" },
                { permission: "edit", pattern: "/etc/*", action: "deny" },
              ],
            }),
          )
          .pipe(Effect.exit)
        expect(denyResult._tag).toBe("Failure")
      }),
    ),
  )

  it.live(
    "no matching rule falls through to ask",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm
          .ask(
            buildRequest({
              patterns: ["/other/path"],
              ruleset: [{ permission: "edit", pattern: "/src/*", action: "allow" }],
            }),
          )
          .pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        expect(pending.length).toBe(1)

        yield* perm.reply({ requestID: pending[0].id, reply: "once" })
        yield* Fiber.join(fiber)
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )
})

// ==================== Permission Types Coverage ====================

describe("TUI Permission Types Coverage", () => {
  const permissionTypes = ["edit", "read", "bash", "glob", "grep", "list", "task", "webfetch", "websearch"] as const

  for (const permType of permissionTypes) {
    it.live(
      `permission type "${permType}" deny rule works`,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const perm = yield* Permission.Service
          const result = yield* perm
            .ask(
              buildRequest({
                permission: permType as never,
                patterns: ["test-pattern"],
                ruleset: [{ permission: permType, pattern: "*", action: "deny" }],
              }),
            )
            .pipe(Effect.exit)
          expect(result._tag).toBe("Failure")
        }),
      ),
    )

    it.live(
      `permission type "${permType}" allow rule works`,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const perm = yield* Permission.Service
          const result = yield* perm
            .ask(
              buildRequest({
                permission: permType as never,
                patterns: ["test-pattern"],
                ruleset: [{ permission: permType, pattern: "*", action: "allow" }],
              }),
            )
            .pipe(Effect.exit)
          expect(result._tag).toBe("Success")
        }),
      ),
    )
  }
})

// ==================== Permission Ask/Reply Flow ====================

describe("TUI Permission Ask/Reply Flow", () => {
  it.live(
    "ask creates pending request",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        expect(pending.length).toBe(1)
        expect(pending[0].permission).toBe("edit")

        yield* perm.reply({ requestID: pending[0].id, reply: "once" })
        yield* Fiber.join(fiber)
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "reply once resolves ask successfully",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        yield* perm.reply({ requestID: pending[0].id, reply: "once" })
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(exit._tag).toBe("Success")

        const afterReply = yield* perm.list()
        expect(afterReply.length).toBe(0)
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "reply reject denies ask",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        yield* perm.reply({ requestID: pending[0].id, reply: "reject" })
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "reply always adds to approved set",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        yield* perm.reply({ requestID: pending[0].id, reply: "always" })
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(exit._tag).toBe("Success")
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "reply with message for reject",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        yield* perm.reply({ requestID: pending[0].id, reply: "reject", message: "Not allowed here" })
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "reply with message for always",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber = yield* perm.ask(buildRequest()).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(100)

        const pending = yield* perm.list()
        yield* perm.reply({ requestID: pending[0].id, reply: "always", message: "Always allow this" })
        const exit = yield* Fiber.join(fiber).pipe(Effect.exit)
        expect(exit._tag).toBe("Success")
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )

  it.live(
    "multiple pending permissions tracked independently",
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const perm = yield* Permission.Service
        const scope = yield* Scope.make()
        const fiber1 = yield* perm.ask(buildRequest({ patterns: ["/path1"] })).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(50)
        const fiber2 = yield* perm.ask(buildRequest({ patterns: ["/path2"] })).pipe(Effect.forkIn(scope))
        yield* Effect.sleep(50)

        const pending = yield* perm.list()
        expect(pending.length).toBe(2)

        yield* perm.reply({ requestID: pending[0].id, reply: "once" })
        yield* perm.reply({ requestID: pending[1].id, reply: "once" })

        yield* Fiber.join(fiber1)
        yield* Fiber.join(fiber2)

        const afterReply = yield* perm.list()
        expect(afterReply.length).toBe(0)
        yield* Scope.close(scope, Exit.void)
      }),
    ),
  )
})
