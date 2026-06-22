/**
 * DecompositionGate — 任务分解编排
 *
 * 功能：
 * - 判断是否需要分解（基于复杂度）
 * - 分解任务为子任务
 * - 验证分解质量
 *
 * 配置：
 * - complexity_threshold: 10000 token（超过考虑分解）
 * - max_subtasks: 5（最多分解5个子任务）
 */

import { Effect, Context, Layer } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "decomposition-gate" })

// ============================================================================
// 类型定义
// ============================================================================

export interface TaskInfo {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly estimatedTokens?: number
  readonly dependencies?: string[]
}

export interface SubTask {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly estimatedTokens: number
  readonly parentId: string
  readonly order: number
}

export interface DecompositionResult {
  readonly shouldDecompose: boolean
  readonly reason?: string
  readonly subtasks?: SubTask[]
}

export interface DecompositionConfig {
  /** 复杂度阈值（token数） */
  complexityThreshold: number
  /** 最大子任务数 */
  maxSubtasks: number
}

const DEFAULT_CONFIG: DecompositionConfig = {
  complexityThreshold: 10000,
  maxSubtasks: 5,
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 判断是否需要分解 */
  readonly shouldDecompose: (task: TaskInfo) => Effect.Effect<DecompositionResult>

  /** 分解任务 */
  readonly decompose: (task: TaskInfo) => Effect.Effect<SubTask[]>

  /** 验证分解质量 */
  readonly validate: (original: TaskInfo, decomposed: SubTask[]) => Effect.Effect<boolean>

  /** 获取配置 */
  readonly getConfig: () => Effect.Effect<DecompositionConfig>

  /** 更新配置 */
  readonly updateConfig: (config: Partial<DecompositionConfig>) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/DecompositionGate") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configRef = yield* Effect.sync(() => ({ ...DEFAULT_CONFIG }))

    const shouldDecompose = Effect.fn("DecompositionGate.shouldDecompose")(function* (task: TaskInfo) {
      log.info("decomposition.evaluate", { taskId: task.id })

      const config = { ...configRef }

      // 如果没有预估token，基于描述长度估算
      const estimatedTokens = task.estimatedTokens ?? estimateTokens(task.description)

      // 检查是否超过阈值
      if (estimatedTokens <= config.complexityThreshold) {
        log.info("decomposition.skip", {
          taskId: task.id,
          reason: "below_threshold",
          tokens: estimatedTokens,
        })
        return { shouldDecompose: false, reason: "任务复杂度低于阈值" }
      }

      log.info("decomposition.recommended", {
        taskId: task.id,
        tokens: estimatedTokens,
      })

      return { shouldDecompose: true }
    })

    const decompose = Effect.fn("DecompositionGate.decompose")(function* (task: TaskInfo) {
      log.info("decomposition.start", { taskId: task.id })

      const config = { ...configRef }
      const estimatedTokens = task.estimatedTokens ?? estimateTokens(task.description)

      // 基于描述分解任务
      const subtasks = splitTask(task, config.maxSubtasks, estimatedTokens)

      log.info("decomposition.complete", {
        taskId: task.id,
        subtaskCount: subtasks.length,
      })

      return subtasks
    })

    const validate = Effect.fn("DecompositionGate.validate")(function* (original: TaskInfo, decomposed: SubTask[]) {
      log.info("decomposition.validate", {
        taskId: original.id,
        subtaskCount: decomposed.length,
      })

      const config = { ...configRef }

      // 检查子任务数量
      if (decomposed.length > config.maxSubtasks) {
        log.warn("decomposition.validate.failed", {
          reason: "too_many_subtasks",
          count: decomposed.length,
          max: config.maxSubtasks,
        })
        return false
      }

      // 检查子任务是否覆盖原任务
      const totalTokens = decomposed.reduce((sum, st) => sum + st.estimatedTokens, 0)
      const originalTokens = original.estimatedTokens ?? estimateTokens(original.description)

      // 允许20%的误差
      if (totalTokens < originalTokens * 0.8) {
        log.warn("decomposition.validate.failed", {
          reason: "insufficient_coverage",
          totalTokens,
          originalTokens,
        })
        return false
      }

      return true
    })

    const getConfig = Effect.fn("DecompositionGate.getConfig")(function* () {
      return { ...configRef }
    })

    const updateConfig = Effect.fn("DecompositionGate.updateConfig")(function* (newConfig: Partial<DecompositionConfig>) {
      Object.assign(configRef, newConfig)
      log.info("decomposition.config.updated", newConfig)
    })

    return { shouldDecompose, decompose, validate, getConfig, updateConfig }
  })
)

export const defaultLayer = layer

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 基于描述估算token数
 */
function estimateTokens(description: string): number {
  // 粗略估算：1个中文字符约2 token，1个英文单词约1.5 token
  const chineseChars = (description.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const englishWords = (description.match(/[a-zA-Z]+/g) ?? []).length
  return Math.ceil(chineseChars * 2 + englishWords * 1.5)
}

/**
 * 分解任务为子任务
 */
function splitTask(task: TaskInfo, maxSubtasks: number, totalTokens: number): SubTask[] {
  const subtasks: SubTask[] = []

  // 基于描述中的步骤或段落分解
  const steps = extractSteps(task.description)

  if (steps.length <= 1) {
    // 无法分解，返回原任务作为单个子任务
    return [{
      id: `${task.id}-1`,
      title: task.title,
      description: task.description,
      estimatedTokens: totalTokens,
      parentId: task.id,
      order: 1,
    }]
  }

  // 分配token给子任务
  const tokensPerSubtask = Math.ceil(totalTokens / Math.min(steps.length, maxSubtasks))

  for (let i = 0; i < Math.min(steps.length, maxSubtasks); i++) {
    subtasks.push({
      id: `${task.id}-${i + 1}`,
      title: `${task.title} - 步骤${i + 1}`,
      description: steps[i],
      estimatedTokens: tokensPerSubtask,
      parentId: task.id,
      order: i + 1,
    })
  }

  return subtasks
}

/**
 * 从描述中提取步骤
 */
function extractSteps(description: string): string[] {
  // 尝试按编号或 bullet 分割
  const steps = description.split(/\n\s*(?:\d+[\.\)、]|[-*])\s+/).filter(s => s.trim())

  if (steps.length > 1) {
    return steps.map(s => s.trim())
  }

  // 尝试按段落分割
  const paragraphs = description.split(/\n\s*\n/).filter(s => s.trim())

  if (paragraphs.length > 1) {
    return paragraphs.map(s => s.trim())
  }

  // 无法分割
  return [description]
}

export * as DecompositionGate from "./decomposition-gate"
