/**
 * Cardinal — 运行时动态阻塞降级
 *
 * 阻塞级别：
 * - block: 严重风险，必须停止（立即终止，飞书通知）
 * - pause: 中等风险，需确认（暂停，飞书等用户确认）
 * - stop: 轻微风险，建议停止（停止，记录日志）
 * - warn: 潜在风险，继续执行（警告，继续执行）
 *
 * 触发条件：
 * - 安全风险: block（检测到eval/exec/密钥泄露）
 * - 过量改动: pause（改动文件数 > 预估文件数 × 2）
 * - 连续失败: pause（同一任务失败3次）
 * - 偏离目标: stop（AlignmentGuard连续3次告警）
 * - token超限: warn（单任务消耗 > 总预算的20%）
 */

import { Effect, Context, Layer } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "cardinal" })

// ============================================================================
// 类型定义
// ============================================================================

export type CardinalLevel = "block" | "pause" | "stop" | "warn"

export interface CardinalDecision {
  readonly level: CardinalLevel
  readonly reason: string
  readonly suggestion?: string
}

export interface ExecutionContext {
  readonly taskId: string
  readonly taskTitle: string
  readonly diff?: string
  readonly changedFiles?: string[]
  readonly consecutiveFailures?: number
  readonly alignmentAlerts?: number
  readonly tokensUsed?: number
  readonly totalBudget?: number
  readonly estimatedFiles?: number
}

export interface CardinalRule {
  readonly id: string
  readonly name: string
  readonly evaluate: (context: ExecutionContext) => Effect.Effect<CardinalDecision | null>
}

// ============================================================================
// 默认规则
// ============================================================================

/**
 * 安全风险检查
 */
function createSecurityRule(): CardinalRule {
  return {
    id: "security",
    name: "安全风险",
    evaluate: (ctx: ExecutionContext) =>
      Effect.gen(function* () {
        if (!ctx.diff) return null

        // 检查eval/exec
        const hasEval = ctx.diff.includes("eval(") || ctx.diff.includes("exec(")
        if (hasEval) {
          return {
            level: "block" as CardinalLevel,
            reason: "检测到eval/exec调用",
            suggestion: "请移除eval/exec调用，使用更安全的替代方案",
          }
        }

        // 检查密钥泄露
        const secretPatterns = [
          /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']+["']/i,
          /(?:AKIA|ASIA)[A-Z0-9]{16}/,
          /sk-[a-zA-Z0-9]{48}/,
          /ghp_[a-zA-Z0-9]{36}/,
        ]

        for (const pattern of secretPatterns) {
          if (pattern.test(ctx.diff)) {
            return {
              level: "block" as CardinalLevel,
              reason: "检测到可能的密钥泄露",
              suggestion: "请移除敏感信息，使用环境变量",
            }
          }
        }

        return null
      }),
  }
}

/**
 * 过量改动检查
 */
function createExcessiveChangesRule(): CardinalRule {
  return {
    id: "excessive_changes",
    name: "过量改动",
    evaluate: (ctx: ExecutionContext) =>
      Effect.gen(function* () {
        if (!ctx.changedFiles || !ctx.estimatedFiles) return null

        const maxFiles = ctx.estimatedFiles * 2
        if (ctx.changedFiles.length > maxFiles) {
          return {
            level: "pause" as CardinalLevel,
            reason: `改动文件数 (${ctx.changedFiles.length}) 超出预期 (${maxFiles})`,
            suggestion: "请确认是否需要这么多改动",
          }
        }

        return null
      }),
  }
}

/**
 * 连续失败检查
 */
function createConsecutiveFailuresRule(): CardinalRule {
  return {
    id: "consecutive_failures",
    name: "连续失败",
    evaluate: (ctx: ExecutionContext) =>
      Effect.gen(function* () {
        if (!ctx.consecutiveFailures) return null

        if (ctx.consecutiveFailures >= 3) {
          return {
            level: "pause" as CardinalLevel,
            reason: `同一任务连续失败 ${ctx.consecutiveFailures} 次`,
            suggestion: "请分析失败原因或调整任务",
          }
        }

        return null
      }),
  }
}

/**
 * 偏离目标检查
 */
function createAlignmentRule(): CardinalRule {
  return {
    id: "alignment",
    name: "偏离目标",
    evaluate: (ctx: ExecutionContext) =>
      Effect.gen(function* () {
        if (!ctx.alignmentAlerts) return null

        if (ctx.alignmentAlerts >= 3) {
          return {
            level: "stop" as CardinalLevel,
            reason: `AlignmentGuard连续 ${ctx.alignmentAlerts} 次告警`,
            suggestion: "请检查是否偏离任务目标",
          }
        }

        return null
      }),
  }
}

/**
 * Token超限检查
 */
function createTokenLimitRule(): CardinalRule {
  return {
    id: "token_limit",
    name: "Token超限",
    evaluate: (ctx: ExecutionContext) =>
      Effect.gen(function* () {
        if (!ctx.tokensUsed || !ctx.totalBudget) return null

        const threshold = ctx.totalBudget * 0.2
        if (ctx.tokensUsed > threshold) {
          return {
            level: "warn" as CardinalLevel,
            reason: `单任务token消耗 (${ctx.tokensUsed.toLocaleString()}) 超出预算20%`,
            suggestion: "请关注token使用效率",
          }
        }

        return null
      }),
  }
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 注册规则 */
  readonly register: (rule: CardinalRule) => Effect.Effect<void>

  /** 评估上下文 */
  readonly evaluate: (context: ExecutionContext) => Effect.Effect<CardinalDecision | null>

  /** 获取所有规则 */
  readonly getAll: () => Effect.Effect<CardinalRule[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Cardinal") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const rules = new Map<string, CardinalRule>()

    // 注册默认规则
    const defaultRules = [
      createSecurityRule(),
      createExcessiveChangesRule(),
      createConsecutiveFailuresRule(),
      createAlignmentRule(),
      createTokenLimitRule(),
    ]

    for (const rule of defaultRules) {
      rules.set(rule.id, rule)
    }

    const register = Effect.fn("Cardinal.register")(function* (rule: CardinalRule) {
      log.info("rule.registered", { id: rule.id })
      rules.set(rule.id, rule)
    })

    const evaluate = Effect.fn("Cardinal.evaluate")(function* (context: ExecutionContext) {
      log.info("cardinal.evaluate", { taskId: context.taskId })

      // 按严重程度排序：block > pause > stop > warn
      const priority: Record<CardinalLevel, number> = {
        block: 4,
        pause: 3,
        stop: 2,
        warn: 1,
      }

      let highestDecision: CardinalDecision | null = null

      for (const rule of rules.values()) {
        const decision = yield* rule.evaluate(context)

        if (decision) {
          if (!highestDecision || priority[decision.level] > priority[highestDecision.level]) {
            highestDecision = decision
          }
        }
      }

      if (highestDecision) {
        log.warn("cardinal.decision", {
          taskId: context.taskId,
          level: highestDecision.level,
          reason: highestDecision.reason,
        })
      }

      return highestDecision
    })

    const getAll = Effect.fn("Cardinal.getAll")(function* () {
      return Array.from(rules.values())
    })

    return { register, evaluate, getAll }
  })
)

export const defaultLayer = layer

export * as Cardinal from "./cardinal"
