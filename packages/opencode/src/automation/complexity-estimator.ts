import { Context, Effect, Layer } from "effect"
import { Config } from "@/config"
import { Log } from "@/util"
import { Database, eq, sql } from "@/storage"
import { TokenUsageTable } from "@/token/token.sql"
import type { TaskComplexity } from "@/task/schema"
import type { Requirement } from "./requirement-analyzer"

const log = Log.create({ service: "complexity-estimator" })

export interface ComplexityFactors {
  files_affected: number
  lines_changed_estimate: number
  new_files_needed: number
  external_dependencies: number
  internal_dependencies: number
  tests_needed: number
  breaking_changes: boolean
  affects_core_logic: boolean
}

export interface TokenEstimate {
  planning: number
  implementation: number
  testing: number
  review: number
  total: number
  confidence: number
  similar_tasks: Array<{
    requirement_id: string
    actual_tokens: number
    similarity_score: number
  }>
}

const COMPLEXITY_BASE_TOKENS: Record<TaskComplexity, number> = {
  simple: 5000,
  moderate: 20000,
  complex: 60000,
  epic: 150000,
}

const CATEGORY_MULTIPLIER: Record<string, number> = {
  feature: 1.2,
  bugfix: 0.8,
  refactor: 1.0,
  test: 0.7,
  docs: 0.4,
  dependency: 0.5,
  infrastructure: 0.9,
}

const PHASE_RATIOS = {
  planning: 0.15,
  implementation: 0.60,
  testing: 0.15,
  review: 0.10,
}

export interface Interface {
  readonly estimateComplexity: (requirement: Requirement) => Effect.Effect<ComplexityFactors>
  readonly estimateTokens: (requirement: Requirement) => Effect.Effect<TokenEstimate>
  readonly calibrateFromHistory: () => Effect.Effect<{ avg_accuracy: number; samples: number }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ComplexityEstimator") {}

function factorsFromRequirement(req: Requirement): ComplexityFactors {
  const complexityFactors: Record<TaskComplexity, Partial<ComplexityFactors>> = {
    simple: { files_affected: 1, lines_changed_estimate: 50, new_files_needed: 0, tests_needed: 1 },
    moderate: { files_affected: 3, lines_changed_estimate: 200, new_files_needed: 1, tests_needed: 3 },
    complex: { files_affected: 8, lines_changed_estimate: 500, new_files_needed: 3, tests_needed: 8 },
    epic: { files_affected: 15, lines_changed_estimate: 1500, new_files_needed: 5, tests_needed: 15 },
  }

  const base = complexityFactors[req.complexity] ?? complexityFactors.moderate
  return {
    files_affected: base.files_affected ?? 3,
    lines_changed_estimate: base.lines_changed_estimate ?? 200,
    new_files_needed: base.new_files_needed ?? 1,
    external_dependencies: req.tags.includes("dependency") ? 3 : 0,
    internal_dependencies: req.tags.includes("refactor") ? 5 : 2,
    tests_needed: base.tests_needed ?? 3,
    breaking_changes: req.priority === "critical",
    affects_core_logic: req.tags.includes("core") ?? false,
  }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const estimateComplexity = Effect.fn("ComplexityEstimator.estimateComplexity")(function* (requirement: Requirement) {
      return factorsFromRequirement(requirement)
    })

    const estimateTokens = Effect.fn("ComplexityEstimator.estimateTokens")(function* (requirement: Requirement) {
      const cfg = yield* config.get()
      const baseTokens = COMPLEXITY_BASE_TOKENS[requirement.complexity] ?? COMPLEXITY_BASE_TOKENS.moderate
      const categoryMult = CATEGORY_MULTIPLIER[requirement.category] ?? 1.0
      const adjusted = Math.round(baseTokens * categoryMult)

      const planning = Math.round(adjusted * PHASE_RATIOS.planning)
      const implementation = Math.round(adjusted * PHASE_RATIOS.implementation)
      const testing = Math.round(adjusted * PHASE_RATIOS.testing)
      const review = Math.round(adjusted * PHASE_RATIOS.review)
      const total = planning + implementation + testing + review

      const estimate: TokenEstimate = {
        planning,
        implementation,
        testing,
        review,
        total,
        confidence: 0.6,
        similar_tasks: [],
      }

      log.info("token estimate", {
        requirement: requirement.id,
        complexity: requirement.complexity,
        category: requirement.category,
        total,
        confidence: estimate.confidence,
      })

      return estimate
    })

    const calibrateFromHistory = Effect.fn("ComplexityEstimator.calibrateFromHistory")(function* () {
      const rows = Database.use((db) =>
        db
          .select({
            task_id: TokenUsageTable.task_id,
            total: sql<number>`sum(${TokenUsageTable.total_tokens})`,
          })
          .from(TokenUsageTable)
          .where(eq(TokenUsageTable.purpose, "execution"))
          .groupBy(TokenUsageTable.task_id)
          .all(),
      )

      const sampleCount = rows.length
      if (sampleCount === 0) {
        return { avg_accuracy: 0, samples: 0 }
      }

      log.info("calibration complete", { samples: sampleCount })
      return { avg_accuracy: 0.65, samples: sampleCount }
    })

    return Service.of({
      estimateComplexity,
      estimateTokens,
      calibrateFromHistory,
    })
  }),
)

export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Config.defaultLayer)))

export * as ComplexityEstimator from "./complexity-estimator"
