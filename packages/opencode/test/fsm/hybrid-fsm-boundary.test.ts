/**
 * HybridFSM 边界条件测试
 *
 * 测试预期以外的行为：
 * - 无效状态转换
 * - 并发访问
 * - 边界条件
 */

import { test, expect, describe } from "bun:test"
import { Effect } from "effect"
import { make, type FSMEvent } from "../../src/session/fsm/hybrid-fsm"

describe("HybridFSM Boundary Tests", () => {
  const runFSM = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect)

  describe("Invalid State Transitions", () => {
    test("idle 状态不能直接执行 CHECK_PASS", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      expect(await runFSM(fsm.getState)).toBe("idle") // 状态不变
    })

    test("idle 状态不能直接执行 HEAL_COMPLETE", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "HEAL_COMPLETE", fix: {} }))
      expect(await runFSM(fsm.getState)).toBe("idle") // 状态不变
    })

    test("idle 状态不能直接执行 DISTILL_COMPLETE", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))
      expect(await runFSM(fsm.getState)).toBe("idle") // 状态不变
    })

    test("planning 状态不能直接执行 CHECK_PASS", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      expect(await runFSM(fsm.getState)).toBe("planning") // 状态不变
    })

    test("executing 状态不能直接执行 PLAN_COMPLETE", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      expect(await runFSM(fsm.getState)).toBe("executing") // 状态不变
    })

    test("completed 状态不能执行任何事件", async () => {
      const fsm = await runFSM(make())

      // 到达 completed 状态
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))

      // 尝试各种事件
      await runFSM(fsm.send({ type: "START", goal: "new" }))
      expect(await runFSM(fsm.getState)).toBe("completed")

      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      expect(await runFSM(fsm.getState)).toBe("completed")

      await runFSM(fsm.send({ type: "ABORT", reason: "test" }))
      expect(await runFSM(fsm.getState)).toBe("completed")
    })

    test("failed 状态不能执行任何事件", async () => {
      const fsm = await runFSM(make())

      // 到达 failed 状态
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_FAIL", error: "error" }))
      await runFSM(fsm.send({ type: "HEAL_EXHAUSTED" }))

      // 尝试各种事件
      await runFSM(fsm.send({ type: "START", goal: "new" }))
      expect(await runFSM(fsm.getState)).toBe("failed")

      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      expect(await runFSM(fsm.getState)).toBe("failed")
    })
  })

  describe("Edge Cases", () => {
    test("多次 START 事件不会改变状态", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "START", goal: "first" }))
      await runFSM(fsm.send({ type: "START", goal: "second" }))
      expect(await runFSM(fsm.getState)).toBe("planning")
      expect(await runFSM(fsm.getGoal)).toBe("first") // 保留第一次的目标
    })

    test("空目标字符串也能工作", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "START", goal: "" }))
      expect(await runFSM(fsm.getState)).toBe("planning")
      expect(await runFSM(fsm.getGoal)).toBe("")
    })

    test("超长目标字符串也能工作", async () => {
      const fsm = await runFSM(make())
      const longGoal = "A".repeat(10000)
      await runFSM(fsm.send({ type: "START", goal: longGoal }))
      expect(await runFSM(fsm.getState)).toBe("planning")
      expect(await runFSM(fsm.getGoal)).toBe(longGoal)
    })

    test("null/undefined 作为事件参数", async () => {
      const fsm = await runFSM(make())

      // FSM 接受 undefined 作为 goal，它会被原样存储
      await runFSM(fsm.send({ type: "START", goal: undefined as unknown as string }))
      expect(await runFSM(fsm.getState)).toBe("planning") // 允许处理
    })

    test("快速连续发送多个事件", async () => {
      const fsm = await runFSM(make())

      // 快速发送多个事件
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))

      expect(await runFSM(fsm.getState)).toBe("completed")
    })
  })

  describe("Suspend/Resume Edge Cases", () => {
    test("completed 状态不能挂起", async () => {
      const fsm = await runFSM(make())

      // 到达 completed 状态
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))

      await runFSM(fsm.send({ type: "SUSPEND" }))
      expect(await runFSM(fsm.getState)).toBe("completed") // 不能挂起
    })

    test("failed 状态不能挂起", async () => {
      const fsm = await runFSM(make())

      // 到达 failed 状态
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_FAIL", error: "error" }))
      await runFSM(fsm.send({ type: "HEAL_EXHAUSTED" }))

      await runFSM(fsm.send({ type: "SUSPEND" }))
      expect(await runFSM(fsm.getState)).toBe("failed") // 不能挂起
    })

    test("idle 状态不能挂起", async () => {
      const fsm = await runFSM(make())
      await runFSM(fsm.send({ type: "SUSPEND" }))
      expect(await runFSM(fsm.getState)).toBe("idle") // 不能挂起
    })

    test("suspended 状态不能再次挂起", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))

      await runFSM(fsm.send({ type: "SUSPEND" }))
      expect(await runFSM(fsm.getState)).toBe("suspended")

      await runFSM(fsm.send({ type: "SUSPEND" }))
      expect(await runFSM(fsm.getState)).toBe("suspended") // 状态不变
    })

    test("suspended 状态不能执行其他事件（除了 RESUME）", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))

      await runFSM(fsm.send({ type: "SUSPEND" }))

      // 尝试各种事件
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      expect(await runFSM(fsm.getState)).toBe("suspended")

      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      expect(await runFSM(fsm.getState)).toBe("suspended")

      // 只有 RESUME 能改变状态
      await runFSM(fsm.send({ type: "RESUME" }))
      expect(await runFSM(fsm.getState)).toBe("executing")
    })
  })

  describe("Escape Hatch Edge Cases", () => {
    test("非 checking 状态不能使用逃生舱", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))

      // planning 状态尝试使用逃生舱
      await runFSM(
        fsm.send({
          type: "REQUEST_GOAL_REVISION",
          reason: "test",
          suggestedFix: {},
        }),
      )
      expect(await runFSM(fsm.getState)).toBe("planning") // 不能使用
    })

    test("reflecting 状态不能使用逃生舱", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

      await runFSM(
        fsm.send({
          type: "REQUEST_GOAL_REVISION",
          reason: "test",
          suggestedFix: {},
        }),
      )

      // 再次尝试使用逃生舱
      await runFSM(
        fsm.send({
          type: "REQUEST_GOAL_REVISION",
          reason: "test again",
          suggestedFix: {},
        }),
      )
      expect(await runFSM(fsm.getState)).toBe("reflecting") // 状态不变
    })

    test("GOAL_REVISION_APPROVED 只能在 reflecting 状态使用", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))

      // planning 状态尝试
      await runFSM(fsm.send({ type: "GOAL_REVISION_APPROVED", newTest: {} }))
      expect(await runFSM(fsm.getState)).toBe("planning") // 不能使用
    })

    test("GOAL_REVISION_REJECTED 只能在 reflecting 状态使用", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))

      // planning 状态尝试
      await runFSM(fsm.send({ type: "GOAL_REVISION_REJECTED", reason: "test" }))
      expect(await runFSM(fsm.getState)).toBe("planning") // 不能使用
    })
  })

  describe("Journal Integrity", () => {
    test("日志记录所有状态转换", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

      const journal = await runFSM(fsm.getJournal)
      expect(journal.length).toBe(3)
      expect(journal[0].state).toBe("planning")
      expect(journal[1].state).toBe("executing")
      expect(journal[2].state).toBe("checking")
    })

    test("无效转换不记录日志", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      const journalBefore = await runFSM(fsm.getJournal)

      // 无效转换
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      const journalAfter = await runFSM(fsm.getJournal)

      expect(journalAfter.length).toBe(journalBefore.length) // 没有新增日志
    })

    test("日志包含时间戳", async () => {
      const fsm = await runFSM(make())

      const before = Date.now()
      await runFSM(fsm.send({ type: "START", goal: "test" }))
      const after = Date.now()

      const journal = await runFSM(fsm.getJournal)
      expect(journal[0].timestamp).toBeGreaterThanOrEqual(before)
      expect(journal[0].timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe("Reset Functionality", () => {
    test("重置后状态回到 idle", async () => {
      const fsm = await runFSM(make())

      await runFSM(fsm.send({ type: "START", goal: "test" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

      await runFSM(fsm.reset)

      expect(await runFSM(fsm.getState)).toBe("idle")
      expect(await runFSM(fsm.getGoal)).toBe("")
      expect(await runFSM(fsm.getJournal)).toEqual([])
    })

    test("重置后可以重新开始", async () => {
      const fsm = await runFSM(make())

      // 第一次运行
      await runFSM(fsm.send({ type: "START", goal: "first" }))
      await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
      await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
      await runFSM(fsm.send({ type: "CHECK_PASS" }))
      await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))

      // 重置
      await runFSM(fsm.reset)

      // 第二次运行
      await runFSM(fsm.send({ type: "START", goal: "second" }))
      expect(await runFSM(fsm.getState)).toBe("planning")
      expect(await runFSM(fsm.getGoal)).toBe("second")
    })
  })
})
