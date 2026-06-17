/**
 * HybridFSM 单元测试
 */

import { test, expect, describe } from "bun:test"
import { Effect } from "effect"
import { make, type FSMState, type FSMEvent } from "../../src/session/fsm/hybrid-fsm"

describe("HybridFSM", () => {
  // Helper to run FSM effects
  const runFSM = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect)

  test("初始状态为 idle", async () => {
    const fsm = await runFSM(make())
    const state = await runFSM(fsm.getState)
    expect(state).toBe("idle")
  })

  test("START 事件触发 planning 状态", async () => {
    const fsm = await runFSM(make())
    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    const state = await runFSM(fsm.getState)
    expect(state).toBe("planning")
  })

  test("完整流转: idle → planning → executing → checking → distilling → completed", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    expect(await runFSM(fsm.getState)).toBe("planning")

    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: { steps: ["step1"] } }))
    expect(await runFSM(fsm.getState)).toBe("executing")

    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: { success: true } }))
    expect(await runFSM(fsm.getState)).toBe("checking")

    await runFSM(fsm.send({ type: "CHECK_PASS" }))
    expect(await runFSM(fsm.getState)).toBe("distilling")

    await runFSM(fsm.send({ type: "DISTILL_COMPLETE", learnings: {} }))
    expect(await runFSM(fsm.getState)).toBe("completed")
  })

  test("CHECK_FAIL 触发 healing 状态", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

    await runFSM(fsm.send({ type: "CHECK_FAIL", error: "测试失败" }))
    expect(await runFSM(fsm.getState)).toBe("healing")
  })

  test("HEAL_COMPLETE 返回 executing 状态", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    await runFSM(fsm.send({ type: "CHECK_FAIL", error: "测试失败" }))

    await runFSM(fsm.send({ type: "HEAL_COMPLETE", fix: {} }))
    expect(await runFSM(fsm.getState)).toBe("executing")
  })

  test("超过 maxHealAttempts 触发 failed 状态", async () => {
    const fsm = await runFSM(make({ maxHealAttempts: 2 }))

    // 第一次循环
    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    await runFSM(fsm.send({ type: "CHECK_FAIL", error: "测试失败" }))
    await runFSM(fsm.send({ type: "HEAL_COMPLETE", fix: {} }))
    expect(await runFSM(fsm.getHealAttempts)).toBe(1)

    // 第二次循环
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    await runFSM(fsm.send({ type: "CHECK_FAIL", error: "测试失败" }))
    await runFSM(fsm.send({ type: "HEAL_COMPLETE", fix: {} }))
    expect(await runFSM(fsm.getHealAttempts)).toBe(2)

    // 第三次循环 - 应该触发 failed
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    await runFSM(fsm.send({ type: "CHECK_FAIL", error: "测试失败" }))
    expect(await runFSM(fsm.getState)).toBe("failed")
  })

  test("REQUEST_GOAL_REVISION 逃生舱进入 reflecting 状态", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

    await runFSM(
      fsm.send({
        type: "REQUEST_GOAL_REVISION",
        reason: "测试用例有误",
        suggestedFix: {},
      }),
    )

    expect(await runFSM(fsm.getState)).toBe("reflecting")
  })

  test("GOAL_REVISION_APPROVED 返回 checking 状态并重置 heal 计数", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

    await runFSM(
      fsm.send({
        type: "REQUEST_GOAL_REVISION",
        reason: "测试用例有误",
        suggestedFix: {},
      }),
    )

    await runFSM(fsm.send({ type: "GOAL_REVISION_APPROVED", newTest: {} }))

    expect(await runFSM(fsm.getState)).toBe("checking")
    expect(await runFSM(fsm.getHealAttempts)).toBe(0)
  })

  test("GOAL_REVISION_REJECTED 返回 healing 状态", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))

    await runFSM(
      fsm.send({
        type: "REQUEST_GOAL_REVISION",
        reason: "测试用例有误",
        suggestedFix: {},
      }),
    )

    await runFSM(fsm.send({ type: "GOAL_REVISION_REJECTED", reason: "不允许修改" }))

    expect(await runFSM(fsm.getState)).toBe("healing")
  })

  test("SUSPEND 和 RESUME 机制", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))

    // 挂起
    await runFSM(fsm.send({ type: "SUSPEND" }))
    expect(await runFSM(fsm.getState)).toBe("suspended")

    // 获取挂起上下文
    const ctx = await runFSM(fsm.getSuspensionContext)
    expect(ctx).toBeDefined()
    expect(ctx?.goal).toBe("测试任务")

    // 恢复
    await runFSM(fsm.send({ type: "RESUME" }))
    expect(await runFSM(fsm.getState)).toBe("executing") // 恢复到挂起前的状态
  })

  test("ABORT 触发 failed 状态", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))

    await runFSM(fsm.send({ type: "ABORT", reason: "用户取消" }))
    expect(await runFSM(fsm.getState)).toBe("failed")
  })

  test("日志记录正确", async () => {
    const fsm = await runFSM(make())

    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))

    const journal = await runFSM(fsm.getJournal)
    expect(journal.length).toBeGreaterThanOrEqual(2)
    expect(journal[0].state).toBe("planning")
    expect(journal[1].state).toBe("executing")
  })

  test("无效转换被忽略", async () => {
    const fsm = await runFSM(make())

    // idle 状态不能直接 EXECUTE_COMPLETE
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    expect(await runFSM(fsm.getState)).toBe("idle")
  })

  test("maxReflectionAttempts 限制逃生舱使用次数", async () => {
    const fsm = await runFSM(make({ maxReflectionAttempts: 1 }))

    // 第一次使用逃生舱
    await runFSM(fsm.send({ type: "START", goal: "测试任务" }))
    await runFSM(fsm.send({ type: "PLAN_COMPLETE", plan: {} }))
    await runFSM(fsm.send({ type: "EXECUTE_COMPLETE", result: {} }))
    await runFSM(
      fsm.send({
        type: "REQUEST_GOAL_REVISION",
        reason: "测试用例有误",
        suggestedFix: {},
      }),
    )

    expect(await runFSM(fsm.getState)).toBe("reflecting")

    // 批准后回到 checking
    await runFSM(fsm.send({ type: "GOAL_REVISION_APPROVED", newTest: {} }))
    expect(await runFSM(fsm.getState)).toBe("checking")

    // 再次尝试使用逃生舱（应该被忽略，因为已用尽）
    await runFSM(
      fsm.send({
        type: "REQUEST_GOAL_REVISION",
        reason: "再次请求",
        suggestedFix: {},
      }),
    )

    // 状态应该保持不变（仍在 checking）
    expect(await runFSM(fsm.getState)).toBe("checking")
  })
})
