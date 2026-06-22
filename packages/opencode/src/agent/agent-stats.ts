/**
 * AgentStats — 三层成功定义
 *
 * 成功级别：
 * - L0: 物理成功（代码能运行）
 * - L1: 功能成功（测试通过）
 * - L2: 价值成功（用户满意）
 *
 * L2判断逻辑：
 * - 任务完成后用户继续修改 = 不满意
 * - 任务完成后用户无后续修改 = 满意
 */

import { Effect, Context, Layer, Ref } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "agent-stats" })

// ============================================================================
// 类型定义
// ============================================================================

export type SuccessLevel = "L0" | "L1" | "L2"

export interface TaskResult {
  readonly taskId: string
  readonly success: boolean
  readonly output?: string
  readonly error?: string
  readonly exitCode?: number
  readonly testPassed?: boolean
  readonly timestamp: number
}

export interface UserInteraction {
  readonly taskId: string
  readonly timestamp: number
  readonly type: "modification" | "question" | "feedback"
}

export interface AgentStatsResult {
  readonly L0: boolean  // 物理成功：代码能运行
  readonly L1: boolean  // 功能成功：测试通过
  readonly L2: boolean  // 价值成功：用户满意
  readonly details: {
    readonly runSuccess: boolean
    readonly testSuccess: boolean
    readonly userSatisfied: boolean
    readonly postCompletionInteractions: number
  }
}

export interface AgentStatsConfig {
  /** L2判断的时间窗口（毫秒） */
  l2TimeWindow: number
  /** L2判断的最大交互次数 */
  l2MaxInteractions: number
}

const DEFAULT_CONFIG: AgentStatsConfig = {
  l2TimeWindow: 30 * 60 * 1000, // 30分钟
  l2MaxInteractions: 3,
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 记录任务结果 */
  readonly recordResult: (result: TaskResult) => Effect.Effect<void>

  /** 记录用户交互 */
  readonly recordInteraction: (interaction: UserInteraction) => Effect.Effect<void>

  /** 评估成功级别 */
  readonly evaluate: (taskId: string) => Effect.Effect<AgentStatsResult>

  /** 获取配置 */
  readonly getConfig: () => Effect.Effect<AgentStatsConfig>

  /** 更新配置 */
  readonly updateConfig: (config: Partial<AgentStatsConfig>) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AgentStats") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configRef = yield* Effect.sync(() => ({ ...DEFAULT_CONFIG }))
    const resultsRef = yield* Ref.make<Map<string, TaskResult>>(new Map())
    const interactionsRef = yield* Ref.make<Map<string, UserInteraction[]>>(new Map())

    const recordResult = Effect.fn("AgentStats.recordResult")(function* (result: TaskResult) {
      log.info("agent-stats.record-result", {
        taskId: result.taskId,
        success: result.success,
      })
      yield* Ref.update(resultsRef, (map) => new Map(map).set(result.taskId, result))
    })

    const recordInteraction = Effect.fn("AgentStats.recordInteraction")(function* (interaction: UserInteraction) {
      log.info("agent-stats.record-interaction", {
        taskId: interaction.taskId,
        type: interaction.type,
      })
      yield* Ref.update(interactionsRef, (map) => {
        const newMap = new Map(map)
        const existing = newMap.get(interaction.taskId) ?? []
        newMap.set(interaction.taskId, [...existing, interaction])
        return newMap
      })
    })

    const evaluate = Effect.fn("AgentStats.evaluate")(function* (taskId: string) {
      log.info("agent-stats.evaluate", { taskId })

      const config = { ...configRef }
      const results = yield* Ref.get(resultsRef)
      const interactions = yield* Ref.get(interactionsRef)

      const result = results.get(taskId)
      const taskInteractions = interactions.get(taskId) ?? []

      // L0: 代码能运行（exitCode为0或无错误）
      const L0 = result?.success ?? false

      // L1: 测试通过
      const L1 = result?.testPassed ?? false

      // L2: 用户满意（无后续修改）
      const postCompletionInteractions = taskInteractions.filter(
        (i) => i.type === "modification" && i.timestamp > (result?.timestamp ?? 0)
      ).length

      const L2 = postCompletionInteractions < config.l2MaxInteractions

      const statsResult: AgentStatsResult = {
        L0,
        L1,
        L2,
        details: {
          runSuccess: L0,
          testSuccess: L1,
          userSatisfied: L2,
          postCompletionInteractions,
        },
      }

      log.info("agent-stats.result", {
        taskId,
        L0,
        L1,
        L2,
        postCompletionInteractions,
      })

      return statsResult
    })

    const getConfig = Effect.fn("AgentStats.getConfig")(function* () {
      return { ...configRef }
    })

    const updateConfig = Effect.fn("AgentStats.updateConfig")(function* (newConfig: Partial<AgentStatsConfig>) {
      Object.assign(configRef, newConfig)
      log.info("agent-stats.config.updated", newConfig)
    })

    return { recordResult, recordInteraction, evaluate, getConfig, updateConfig }
  })
)

export const defaultLayer = layer

export * as AgentStats from "./agent-stats"
