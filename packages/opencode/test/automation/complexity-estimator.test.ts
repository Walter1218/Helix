import { test, expect, describe } from "bun:test"
import type { Requirement } from "../../src/automation/requirement-analyzer"

describe("complexity-estimator", () => {
  const COMPLEXITY_BASE_TOKENS: Record<string, number> = {
    simple: 5000, moderate: 20000, complex: 60000, epic: 150000,
  }

  const CATEGORY_MULTIPLIER: Record<string, number> = {
    feature: 1.2, bugfix: 0.8, refactor: 1.0, test: 0.7,
    docs: 0.4, dependency: 0.5, infrastructure: 0.9,
  }

  const PHASE_RATIOS = {
    planning: 0.15, implementation: 0.60, testing: 0.15, review: 0.10,
  }

  const makeReq = (overrides: Partial<Requirement> = {}): Requirement => ({
    id: "R001", title: "test", description: "test requirement",
    category: "feature", priority: "medium", complexity: "moderate",
    estimated_tokens: 20000, goal_alignment: 0.5, tags: [], ...overrides,
  })

  describe("token estimate calculation", () => {
    const estimateTokens = (req: Requirement) => {
      const baseTokens = COMPLEXITY_BASE_TOKENS[req.complexity] ?? COMPLEXITY_BASE_TOKENS.moderate
      const categoryMult = CATEGORY_MULTIPLIER[req.category] ?? 1.0
      const adjusted = Math.round(baseTokens * categoryMult)
      const planning = Math.round(adjusted * PHASE_RATIOS.planning)
      const implementation = Math.round(adjusted * PHASE_RATIOS.implementation)
      const testing = Math.round(adjusted * PHASE_RATIOS.testing)
      const review = Math.round(adjusted * PHASE_RATIOS.review)
      const total = planning + implementation + testing + review
      return { planning, implementation, testing, review, total }
    }

    test("simple feature 估算", () => {
      const result = estimateTokens(makeReq({ complexity: "simple", category: "feature" }))
      // 5000 * 1.2 = 6000
      expect(result.total).toBe(6000)
      expect(result.planning).toBe(Math.round(6000 * 0.15))
      expect(result.implementation).toBe(Math.round(6000 * 0.60))
    })

    test("moderate bugfix 估算", () => {
      const result = estimateTokens(makeReq({ complexity: "moderate", category: "bugfix" }))
      // 20000 * 0.8 = 16000
      expect(result.total).toBe(16000)
    })

    test("complex refactor 估算", () => {
      const result = estimateTokens(makeReq({ complexity: "complex", category: "refactor" }))
      // 60000 * 1.0 = 60000
      expect(result.total).toBe(60000)
    })

    test("epic feature 估算", () => {
      const result = estimateTokens(makeReq({ complexity: "epic", category: "feature" }))
      // 150000 * 1.2 = 180000
      expect(result.total).toBe(180000)
    })

    test("docs 类别乘数最低", () => {
      const result = estimateTokens(makeReq({ complexity: "moderate", category: "docs" }))
      // 20000 * 0.4 = 8000
      expect(result.total).toBe(8000)
    })

    test("四阶段比例之和为 1", () => {
      const sum = PHASE_RATIOS.planning + PHASE_RATIOS.implementation + PHASE_RATIOS.testing + PHASE_RATIOS.review
      expect(sum).toBe(1.0)
    })

    test("各阶段 token 之和等于 total", () => {
      const result = estimateTokens(makeReq({ complexity: "complex", category: "feature" }))
      expect(result.planning + result.implementation + result.testing + result.review).toBe(result.total)
    })
  })

  describe("ComplexityFactors from requirement", () => {
    const factorsFromRequirement = (req: Requirement) => {
      const complexityFactors: Record<string, Record<string, number>> = {
        simple: { files_affected: 1, lines_changed_estimate: 50, new_files_needed: 0, tests_needed: 1 },
        moderate: { files_affected: 3, lines_changed_estimate: 200, new_files_needed: 1, tests_needed: 3 },
        complex: { files_affected: 8, lines_changed_estimate: 500, new_files_needed: 3, tests_needed: 8 },
        epic: { files_affected: 15, lines_changed_estimate: 1500, new_files_needed: 5, tests_needed: 15 },
      }
      const base = complexityFactors[req.complexity] ?? complexityFactors.moderate
      return {
        files_affected: base.files_affected,
        lines_changed_estimate: base.lines_changed_estimate,
        new_files_needed: base.new_files_needed,
        external_dependencies: req.tags.includes("dependency") ? 3 : 0,
        internal_dependencies: req.tags.includes("refactor") ? 5 : 2,
        tests_needed: base.tests_needed,
        breaking_changes: req.priority === "critical",
        affects_core_logic: req.tags.includes("core"),
      }
    }

    test("simple 任务影响范围小", () => {
      const factors = factorsFromRequirement(makeReq({ complexity: "simple" }))
      expect(factors.files_affected).toBe(1)
      expect(factors.lines_changed_estimate).toBe(50)
    })

    test("epic 任务影响范围大", () => {
      const factors = factorsFromRequirement(makeReq({ complexity: "epic" }))
      expect(factors.files_affected).toBe(15)
      expect(factors.lines_changed_estimate).toBe(1500)
    })

    test("critical 优先级标记 breaking_changes", () => {
      const factors = factorsFromRequirement(makeReq({ priority: "critical" }))
      expect(factors.breaking_changes).toBe(true)
    })

    test("非 critical 不标记 breaking_changes", () => {
      const factors = factorsFromRequirement(makeReq({ priority: "high" }))
      expect(factors.breaking_changes).toBe(false)
    })

    test("dependency 标签增加外部依赖", () => {
      const factors = factorsFromRequirement(makeReq({ tags: ["dependency"] }))
      expect(factors.external_dependencies).toBe(3)
    })

    test("refactor 标签增加内部依赖", () => {
      const factors = factorsFromRequirement(makeReq({ tags: ["refactor"] }))
      expect(factors.internal_dependencies).toBe(5)
    })

    test("core 标签标记 affects_core_logic", () => {
      const factors = factorsFromRequirement(makeReq({ tags: ["core"] }))
      expect(factors.affects_core_logic).toBe(true)
    })
  })
})
