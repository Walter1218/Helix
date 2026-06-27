/**
 * Pre-flight — 任务执行前准入检查
 *
 * 检查项：
 * - spec完整性: OpenSpec需求是否明确
 * - token预算: 剩余token是否够用
 * - 依赖检查: 前置任务是否完成
 * - 权限检查: 是否需要特殊权限
 *
 * 处理流程：
 * - block → 跳过，飞书通知原因
 * - pause → 飞书通知，等用户确认后继续
 * - warn → 记录日志，继续执行
 */

import { Effect, Context, Layer } from "effect"
import { Log } from "@/util"

const log = Log.create({ service: "preflight" })

// ============================================================================
// 类型定义
// ============================================================================

export type CheckLevel = "block" | "pause" | "warn" | "info"

export interface CheckResult {
  readonly passed: boolean
  readonly level: CheckLevel
  readonly message: string
  readonly suggestion?: string
}

export interface PreFlightCheck {
  readonly id: string
  readonly name: string
  readonly check: (task: TaskInfo) => Effect.Effect<CheckResult>
}

export interface TaskInfo {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly specPath?: string
  readonly dependencies?: string[]
  readonly estimatedTokens?: number
}

export interface EnrichedCheckResult extends CheckResult {
  readonly id: string
  readonly name: string
}

export interface PreFlightResult {
  readonly passed: boolean
  readonly blocked: boolean
  readonly paused: boolean
  readonly results: EnrichedCheckResult[]
  readonly blockReason?: string
  readonly pauseReason?: string
}

export type FrontendCheckStatus = "pending" | "running" | "completed" | "warning" | "failed"

export interface FrontendCheckItem {
  readonly id: string
  readonly label: string
  readonly status: FrontendCheckStatus
  readonly details?: string
  readonly subItems?: FrontendCheckItem[]
}

export type FrontendTrustLevel = "high" | "medium" | "low"

export interface FrontendPreFlightCheck {
  readonly items: FrontendCheckItem[]
  readonly trustLevel: FrontendTrustLevel
  readonly autoLearnEnabled: boolean
  readonly cooldownRemaining?: number
  readonly decision: "proceed" | "pause" | "block"
}

// ============================================================================
// 默认检查项
// ============================================================================

/**
 * Spec完整性检查
 */
function createSpecCheck(): PreFlightCheck {
  return {
    id: "spec_completeness",
    name: "Spec完整性",
    check: (task: TaskInfo) =>
      Effect.gen(function* () {
        // 如果没有specPath，跳过检查
        if (!task.specPath) {
          return { passed: true, level: "info" as CheckLevel, message: "无关联spec" }
        }

        // 检查spec文件是否存在（简化版，实际应读取文件内容）
        const hasSpec = task.specPath.length > 0

        if (!hasSpec) {
          return {
            passed: false,
            level: "block" as CheckLevel,
            message: "spec文件不存在",
            suggestion: "请先创建spec文件",
          }
        }

        // 检查需求是否明确（通过描述长度判断）
        if (task.description.length < 20) {
          return {
            passed: false,
            level: "block" as CheckLevel,
            message: "需求描述过短，可能不明确",
            suggestion: "请补充详细的需求描述",
          }
        }

        return { passed: true, level: "info" as CheckLevel, message: "spec完整性检查通过" }
      }),
  }
}

/**
 * Token预算检查
 */
function createBudgetCheck(): PreFlightCheck {
  return {
    id: "token_budget",
    name: "Token预算",
    check: (task: TaskInfo) =>
      Effect.gen(function* () {
        // 获取每日token限制（默认20M）
        const dailyLimit = 20_000_000

        // 如果没有预估token，跳过检查
        if (!task.estimatedTokens) {
          return { passed: true, level: "info" as CheckLevel, message: "无预估token" }
        }

        // 检查是否超出限制
        if (task.estimatedTokens > dailyLimit * 0.5) {
          return {
            passed: false,
            level: "block" as CheckLevel,
            message: `预估token (${task.estimatedTokens.toLocaleString()}) 超出单日限制50%`,
            suggestion: "请拆分任务或增加预算",
          }
        }

        return { passed: true, level: "info" as CheckLevel, message: "token预算检查通过" }
      }),
  }
}

/**
 * 依赖检查
 */
function createDependencyCheck(): PreFlightCheck {
  return {
    id: "dependencies",
    name: "依赖检查",
    check: (task: TaskInfo) =>
      Effect.gen(function* () {
        // 如果没有依赖，跳过检查
        if (!task.dependencies || task.dependencies.length === 0) {
          return { passed: true, level: "info" as CheckLevel, message: "无依赖任务" }
        }

        // 简化版：假设依赖未完成
        // 实际应检查roadmap中依赖任务的状态
        return {
          passed: false,
          level: "pause" as CheckLevel,
          message: `有 ${task.dependencies.length} 个依赖任务未完成`,
          suggestion: "请等待依赖任务完成或手动确认继续",
        }
      }),
  }
}

/**
 * 权限检查
 */
function createPermissionCheck(): PreFlightCheck {
  return {
    id: "permissions",
    name: "权限检查",
    check: (task: TaskInfo) =>
      Effect.gen(function* () {
        // 检查是否需要特殊权限
        const needsSudo = task.description.includes("sudo") || task.description.includes("root")
        const needsNetwork = task.description.includes("网络") || task.description.includes("API")

        if (needsSudo) {
          return {
            passed: true,
            level: "warn" as CheckLevel,
            message: "任务可能需要sudo权限",
            suggestion: "请确保有足够权限",
          }
        }

        if (needsNetwork) {
          return {
            passed: true,
            level: "warn" as CheckLevel,
            message: "任务需要网络访问",
            suggestion: "请确保网络连接正常",
          }
        }

        return { passed: true, level: "info" as CheckLevel, message: "权限检查通过" }
      }),
  }
}

// ============================================================================
// 前端格式转换
// ============================================================================

function checkLevelToStatus(result: EnrichedCheckResult): FrontendCheckStatus {
  if (!result.passed) return result.level === "block" ? "failed" : "warning"
  if (result.level === "warn") return "warning"
  return "completed"
}

export function toFrontendFormat(result: PreFlightResult): FrontendPreFlightCheck {
  const items: FrontendCheckItem[] = result.results.map((r) => ({
    id: r.id,
    label: r.name,
    status: checkLevelToStatus(r),
    details: r.message,
  }))

  const failedCount = items.filter((i) => i.status === "failed").length
  const warningCount = items.filter((i) => i.status === "warning").length
  const trustLevel: FrontendTrustLevel =
    failedCount > 0 ? "low" : warningCount > 0 ? "medium" : "high"

  const decision = result.blocked ? "block" : result.paused ? "pause" : "proceed"

  return { items, trustLevel, autoLearnEnabled: false, decision }
}

// ============================================================================
// Service 接口
// ============================================================================

export interface Interface {
  /** 注册检查项 */
  readonly register: (check: PreFlightCheck) => Effect.Effect<void>

  /** 运行所有检查 */
  readonly runAll: (task: TaskInfo) => Effect.Effect<PreFlightResult>

  /** 获取所有检查项 */
  readonly getAll: () => Effect.Effect<PreFlightCheck[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PreFlight") {}

// ============================================================================
// 实现
// ============================================================================

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const checks = new Map<string, PreFlightCheck>()

    // 注册默认检查项
    const defaultChecks = [
      createSpecCheck(),
      createBudgetCheck(),
      createDependencyCheck(),
      createPermissionCheck(),
    ]

    for (const check of defaultChecks) {
      checks.set(check.id, check)
    }

    const register = Effect.fn("PreFlight.register")(function* (check: PreFlightCheck) {
      log.info("check.registered", { id: check.id })
      checks.set(check.id, check)
    })

    const runAll = Effect.fn("PreFlight.runAll")(function* (task: TaskInfo) {
      log.info("preflight.start", { taskId: task.id })

      const results: EnrichedCheckResult[] = []
      let blocked = false
      let paused = false
      let blockReason: string | undefined
      let pauseReason: string | undefined

      for (const check of checks.values()) {
        const result = yield* check.check(task)
        results.push({ ...result, id: check.id, name: check.name })

        if (!result.passed) {
          if (result.level === "block") {
            blocked = true
            blockReason = result.message
          } else if (result.level === "pause") {
            paused = true
            pauseReason = result.message
          }
        }
      }

      const passed = !blocked && !paused

      log.info("preflight.complete", {
        taskId: task.id,
        passed,
        blocked,
        paused,
        checkCount: results.length,
      })

      return { passed, blocked, paused, results, blockReason, pauseReason }
    })

    const getAll = Effect.fn("PreFlight.getAll")(function* () {
      return Array.from(checks.values())
    })

    return { register, runAll, getAll }
  })
)

export const defaultLayer = layer

export * as PreFlight from "./preflight"
