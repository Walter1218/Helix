import { Context, Effect, Layer } from "effect"
import { Config } from "@/config"
import { TokenTracker } from "@/token/tracker"
import { Log } from "@/util"
import type { Requirement } from "./requirement-analyzer"
import type { TokenEstimate } from "./complexity-estimator"
import { ComplexityEstimator } from "./complexity-estimator"

const log = Log.create({ service: "token-scheduler" })

export interface ScheduledTask {
  requirement: Requirement
  token_estimate: TokenEstimate
  allocated_tokens: number
  execution_order: number
}

export interface ScheduleOutput {
  selected_tasks: ScheduledTask[]
  deferred_tasks: Array<{ requirement: Requirement; reason: string }>
  stats: {
    total_allocated: number
    remaining_budget: number
    tasks_selected: number
    tasks_deferred: number
    strategy_used: string
  }
  rationale: string
}

export type ScheduleStrategy = "priority_first" | "balance" | "quick_wins"

export interface ScheduleInput {
  requirements: Requirement[]
  daily_budget?: number
  strategy?: ScheduleStrategy
  max_task_tokens?: number
  min_task_tokens?: number
}

export interface Interface {
  readonly schedule: (input: ScheduleInput) => Effect.Effect<ScheduleOutput>
  readonly getStrategyRecommendation: (requirements: Requirement[], budget: number) => Effect.Effect<ScheduleStrategy>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenScheduler") {}

function sortByPriority(reqs: Requirement[]): Requirement[] {
  const weight = { critical: 4, high: 3, medium: 2, low: 1 }
  return [...reqs].sort((a, b) => weight[b.priority] - weight[a.priority] || b.goal_alignment - a.goal_alignment)
}

function sortByQuickWins(reqs: Requirement[]): Requirement[] {
  const complexityWeight = { simple: 1, moderate: 2, complex: 3, epic: 4 }
  const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
  return [...reqs].sort((a, b) => {
    const aValue = priorityWeight[a.priority] / (complexityWeight[a.complexity] || 1)
    const bValue = priorityWeight[b.priority] / (complexityWeight[b.complexity] || 1)
    return bValue - aValue
  })
}

function sortByBalance(reqs: Requirement[]): Requirement[] {
  const complexityWeight = { simple: 1, moderate: 2, complex: 3, epic: 4 }
  const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
  return [...reqs].sort((a, b) => {
    const aScore = priorityWeight[a.priority] * 0.6 + (1 / (complexityWeight[a.complexity] || 1)) * 0.4
    const bScore = priorityWeight[b.priority] * 0.6 + (1 / (complexityWeight[b.complexity] || 1)) * 0.4
    return bScore - aScore
  })
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const tokenTracker = yield* TokenTracker.Service
    const complexityEstimator = yield* ComplexityEstimator.Service

    const schedule = Effect.fn("TokenScheduler.schedule")(function* (input: ScheduleInput) {
      const cfg = yield* config.get()
      const budget = input.daily_budget ?? cfg.token_budget?.daily_limit ?? 0
      const strategy = input.strategy ?? "priority_first"
      const maxTaskTokens = input.max_task_tokens ?? Math.round(budget * 0.5)
      const minTaskTokens = input.min_task_tokens ?? 1000

      const budgetInfo = yield* tokenTracker.getDailyBudget()
      const remaining = budget > 0 ? Math.max(0, budget - budgetInfo.used) : Infinity

      log.info("scheduling tasks", {
        totalRequirements: input.requirements.length,
        budget,
        remaining,
        strategy,
      })

      let sorted: Requirement[]
      switch (strategy) {
        case "quick_wins":
          sorted = sortByQuickWins(input.requirements)
          break
        case "balance":
          sorted = sortByBalance(input.requirements)
          break
        case "priority_first":
        default:
          sorted = sortByPriority(input.requirements)
          break
      }

      const selected: ScheduledTask[] = []
      const deferred: Array<{ requirement: Requirement; reason: string }> = []
      let totalAllocated = 0

      for (const req of sorted) {
        if (totalAllocated >= remaining) {
          deferred.push({ requirement: req, reason: "budget_exhausted" })
          continue
        }

        const estimate = yield* complexityEstimator.estimateTokens(req)

        if (estimate.total > maxTaskTokens) {
          deferred.push({ requirement: req, reason: "exceeds_max_task_tokens" })
          continue
        }

        if (estimate.total < minTaskTokens) {
          const allocated = Math.min(estimate.total, remaining - totalAllocated)
          if (allocated <= 0) {
            deferred.push({ requirement: req, reason: "budget_exhausted" })
            continue
          }
          selected.push({
            requirement: req,
            token_estimate: estimate,
            allocated_tokens: allocated,
            execution_order: selected.length + 1,
          })
          totalAllocated += allocated
          continue
        }

        const allocated = Math.min(estimate.total, remaining - totalAllocated)
        if (allocated <= 0) {
          deferred.push({ requirement: req, reason: "budget_exhausted" })
          continue
        }

        selected.push({
          requirement: req,
          token_estimate: estimate,
          allocated_tokens: allocated,
          execution_order: selected.length + 1,
        })
        totalAllocated += allocated
      }

      const output: ScheduleOutput = {
        selected_tasks: selected,
        deferred_tasks: deferred,
        stats: {
          total_allocated: totalAllocated,
          remaining_budget: Math.max(0, remaining - totalAllocated),
          tasks_selected: selected.length,
          tasks_deferred: deferred.length,
          strategy_used: strategy,
        },
        rationale: `使用 ${strategy} 策略，从 ${input.requirements.length} 个需求中选择了 ${selected.length} 个任务，分配 ${totalAllocated} tokens`,
      }

      log.info("schedule complete", {
        selected: output.stats.tasks_selected,
        deferred: output.stats.tasks_deferred,
        allocated: output.stats.total_allocated,
        remaining: output.stats.remaining_budget,
      })

      return output
    })

    const getStrategyRecommendation = Effect.fn("TokenScheduler.getStrategyRecommendation")(function* (
      requirements: Requirement[],
      budget: number,
    ) {
      const criticalCount = requirements.filter((r) => r.priority === "critical").length
      const simpleCount = requirements.filter((r) => r.complexity === "simple").length
      const totalEstimated = requirements.reduce((acc, r) => acc + (r.estimated_tokens ?? 20000), 0)

      if (criticalCount > 0 && budget >= totalEstimated * 0.3) {
        return "priority_first" as ScheduleStrategy
      }
      if (simpleCount > requirements.length * 0.5) {
        return "quick_wins" as ScheduleStrategy
      }
      return "balance" as ScheduleStrategy
    })

    return Service.of({
      schedule,
      getStrategyRecommendation,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(TokenTracker.defaultLayer),
    Layer.provide(ComplexityEstimator.defaultLayer),
  ),
)

export * as TokenScheduler from "./token-scheduler"
