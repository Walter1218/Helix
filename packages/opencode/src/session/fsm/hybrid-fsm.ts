/**
 * HybridFSM — 可挂起的任务状态机
 *
 * 主干流转由宿主代码严格控制，支持挂起 (Suspend) 和恢复 (Resume)。
 * Check 节点有 Request_Goal_Revision 逃生舱，允许修改测试用例。
 *
 * @module session/fsm/hybrid-fsm
 */

import { Effect, Ref, Deferred } from "effect"

// ── State Types ──────────────────────────────────────────────

/** FSM 状态枚举 */
export type FSMState =
  | "idle"
  | "planning"
  | "executing"
  | "checking"
  | "healing"
  | "distilling"
  | "reflecting" // 逃生舱：Request_Goal_Revision 进入
  | "suspended"
  | "completed"
  | "failed"

/** FSM 事件类型 */
export type FSMEvent =
  | { type: "START"; goal: string }
  | { type: "PLAN_COMPLETE"; plan: unknown }
  | { type: "EXECUTE_COMPLETE"; result: unknown }
  | { type: "CHECK_PASS" }
  | { type: "CHECK_FAIL"; error: string }
  | { type: "HEAL_COMPLETE"; fix: unknown }
  | { type: "HEAL_EXHAUSTED" }
  | { type: "DISTILL_COMPLETE"; learnings: unknown }
  | { type: "REQUEST_GOAL_REVISION"; reason: string; suggestedFix: unknown }
  | { type: "GOAL_REVISION_APPROVED"; newTest: unknown }
  | { type: "GOAL_REVISION_REJECTED"; reason: string }
  | { type: "SUSPEND" }
  | { type: "RESUME" }
  | { type: "ABORT"; reason: string }

/** 挂起上下文 */
export interface SuspensionContext {
  readonly state: FSMState
  readonly goal: string
  readonly plan: unknown
  readonly executionResult: unknown
  readonly checkError?: string
  readonly healAttempts: number
  readonly journal: FSMJournalEntry[]
  readonly suspendedAt: number
}

/** 日志条目 */
export interface FSMJournalEntry {
  readonly state: FSMState
  readonly timestamp: number
  readonly duration: number
  readonly input?: unknown
  readonly output?: unknown
  readonly error?: string
}

/** FSM 配置 */
export interface HybridFSMConfig {
  readonly maxHealAttempts: number
  readonly maxReflectionAttempts: number
  readonly suspendable: boolean
}

// ── State Machine ────────────────────────────────────────────

/**
 * 创建 HybridFSM 实例
 *
 * 使用 Effect Ref 管理状态，Deferred 处理挂起/恢复
 */
export const make = Effect.fn("HybridFSM.make")(function* (config: Partial<HybridFSMConfig> = {}) {
  const cfg: HybridFSMConfig = {
    maxHealAttempts: 3,
    maxReflectionAttempts: 2,
    suspendable: true,
    ...config,
  }

  // 内部状态
  const stateRef = yield* Ref.make<FSMState>("idle")
  const goalRef = yield* Ref.make<string>("")
  const planRef = yield* Ref.make<unknown>(undefined)
  const resultRef = yield* Ref.make<unknown>(undefined)
  const errorRef = yield* Ref.make<string | undefined>(undefined)
  const healAttemptsRef = yield* Ref.make(0)
  const reflectionAttemptsRef = yield* Ref.make(0)
  const journalRef = yield* Ref.make<FSMJournalEntry[]>([])

  // 挂起/恢复机制
  const suspendDeferredRef = yield* Ref.make<Deferred.Deferred<void> | undefined>(undefined)

  const addJournalEntry = (state: FSMState, input?: unknown, output?: unknown, error?: string) =>
    Ref.update(journalRef, (entries) => {
      const now = Date.now()
      const lastEntry = entries[entries.length - 1]
      const duration = lastEntry ? now - lastEntry.timestamp : 0
      return [
        ...entries,
        {
          state,
          timestamp: now,
          duration,
          input,
          output,
          error,
        },
      ]
    })

  // ── Public API ────────────────────────────────────────────

  /** 当前状态 */
  const getState = Ref.get(stateRef)

  /** 当前目标 */
  const getGoal = Ref.get(goalRef)

  /** 日志 */
  const getJournal = Ref.get(journalRef)

  /** 尝试次数 */
  const getHealAttempts = Ref.get(healAttemptsRef)

  /** 挂起上下文 */
  const getSuspensionContext = Effect.gen(function* () {
    const state = yield* Ref.get(stateRef)
    if (state !== "suspended") return undefined

    return {
      state,
      goal: yield* Ref.get(goalRef),
      plan: yield* Ref.get(planRef),
      executionResult: yield* Ref.get(resultRef),
      checkError: yield* Ref.get(errorRef),
      healAttempts: yield* Ref.get(healAttemptsRef),
      journal: yield* Ref.get(journalRef),
      suspendedAt: Date.now(),
    } satisfies SuspensionContext
  })

  /** 发送事件 */
  const send = (event: FSMEvent): Effect.Effect<void> =>
    Effect.gen(function* () {
      const currentState = yield* Ref.get(stateRef)

      // 状态转换规则 - 返回 { next, action? } 或 undefined
      let nextState: FSMState | undefined
      let action: Effect.Effect<void> | undefined

      switch (event.type) {
        case "START":
          if (currentState === "idle") {
            yield* Ref.set(goalRef, event.goal)
            nextState = "planning"
          }
          break

        case "PLAN_COMPLETE":
          if (currentState === "planning") {
            yield* Ref.set(planRef, event.plan)
            nextState = "executing"
          }
          break

        case "EXECUTE_COMPLETE":
          if (currentState === "executing") {
            yield* Ref.set(resultRef, event.result)
            nextState = "checking"
          }
          break

        case "CHECK_PASS":
          if (currentState === "checking") {
            nextState = "distilling"
          }
          break

        case "CHECK_FAIL":
          if (currentState === "checking") {
            yield* Ref.set(errorRef, event.error)
            const attempts = yield* Ref.get(healAttemptsRef)
            nextState = attempts >= cfg.maxHealAttempts ? "failed" : "healing"
          }
          break

        case "HEAL_COMPLETE":
          if (currentState === "healing") {
            yield* Ref.update(healAttemptsRef, (n) => n + 1)
            nextState = "executing"
          }
          break

        case "HEAL_EXHAUSTED":
          if (currentState === "healing") {
            nextState = "failed"
          }
          break

        case "DISTILL_COMPLETE":
          if (currentState === "distilling") {
            nextState = "completed"
          }
          break

        case "REQUEST_GOAL_REVISION":
          // 逃生舱：仅在 Check 阶段可用
          if (currentState === "checking") {
            const reflections = yield* Ref.get(reflectionAttemptsRef)
            if (reflections < cfg.maxReflectionAttempts) {
              yield* Ref.update(reflectionAttemptsRef, (n) => n + 1)
              yield* Ref.set(errorRef, event.reason)
              nextState = "reflecting"
            }
          }
          break

        case "GOAL_REVISION_APPROVED":
          if (currentState === "reflecting") {
            // 重置 heal 尝试次数，因为测试用例已修改
            yield* Ref.set(healAttemptsRef, 0)
            nextState = "checking"
          }
          break

        case "GOAL_REVISION_REJECTED":
          if (currentState === "reflecting") {
            nextState = "healing"
          }
          break

        case "SUSPEND":
          if (cfg.suspendable && !["idle", "completed", "failed", "suspended"].includes(currentState)) {
            const deferred = yield* Deferred.make<void>()
            yield* Ref.set(suspendDeferredRef, deferred)
            nextState = "suspended"
          }
          break

        case "RESUME":
          if (currentState === "suspended") {
            const deferred = yield* Ref.get(suspendDeferredRef)
            if (deferred) {
              yield* Deferred.succeed(deferred, undefined as void)
            }
            // 恢复到挂起前的状态（通过日志获取）
            const journal = yield* Ref.get(journalRef)
            const prevState = journal.length >= 2 ? journal[journal.length - 2].state : "idle"
            nextState = prevState
          }
          break

        case "ABORT":
          if (!["completed", "failed"].includes(currentState)) {
            nextState = "failed"
          }
          break
      }

      // 无效转换，忽略
      if (!nextState) return

      const from = currentState

      // 执行动作（如果有）
      if (action) yield* action

      // 记录日志
      yield* addJournalEntry(nextState, event)

      // 更新状态
      yield* Ref.set(stateRef, nextState)
    })

  /** 等待恢复（挂起时阻塞） */
  const awaitResume = Effect.gen(function* () {
    const deferred = yield* Ref.get(suspendDeferredRef)
    if (deferred) {
      yield* Deferred.await(deferred)
    }
  })

  /** 重置状态机 */
  const reset = Effect.gen(function* () {
    yield* Ref.set(stateRef, "idle")
    yield* Ref.set(goalRef, "")
    yield* Ref.set(planRef, undefined)
    yield* Ref.set(resultRef, undefined)
    yield* Ref.set(errorRef, undefined)
    yield* Ref.set(healAttemptsRef, 0)
    yield* Ref.set(reflectionAttemptsRef, 0)
    yield* Ref.set(journalRef, [])
    yield* Ref.set(suspendDeferredRef, undefined)
  })

  return {
    getState,
    getGoal,
    getJournal,
    getHealAttempts,
    getSuspensionContext,
    send,
    awaitResume,
    reset,
    config: cfg,
  } as const
})

// ── Types Export ─────────────────────────────────────────────

export type HybridFSM = ReturnType<typeof make>
