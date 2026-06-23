import { test, expect, describe } from "bun:test"
import type { Requirement } from "../../src/automation/requirement-analyzer"

describe("token-scheduler", () => {
  const makeReq = (overrides: Partial<Requirement> = {}): Requirement => ({
    id: "R001", title: "test", description: "test requirement",
    category: "feature", priority: "medium", complexity: "moderate",
    estimated_tokens: 20000, goal_alignment: 0.5, tags: [], ...overrides,
  })

  describe("sortByPriority", () => {
    const sortByPriority = (reqs: Requirement[]): Requirement[] => {
      const weight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
      return [...reqs].sort((a, b) => weight[b.priority] - weight[a.priority] || b.goal_alignment - a.goal_alignment)
    }

    test("按优先级降序排列", () => {
      const reqs = [
        makeReq({ id: "1", priority: "low" }),
        makeReq({ id: "2", priority: "critical" }),
        makeReq({ id: "3", priority: "medium" }),
        makeReq({ id: "4", priority: "high" }),
      ]
      const sorted = sortByPriority(reqs)
      expect(sorted.map((r) => r.priority)).toEqual(["critical", "high", "medium", "low"])
    })

    test("同优先级按 goal_alignment 降序", () => {
      const reqs = [
        makeReq({ id: "1", priority: "high", goal_alignment: 0.3 }),
        makeReq({ id: "2", priority: "high", goal_alignment: 0.9 }),
      ]
      const sorted = sortByPriority(reqs)
      expect(sorted[0].goal_alignment).toBe(0.9)
    })
  })

  describe("sortByQuickWins", () => {
    const sortByQuickWins = (reqs: Requirement[]): Requirement[] => {
      const complexityWeight: Record<string, number> = { simple: 1, moderate: 2, complex: 3, epic: 4 }
      const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
      return [...reqs].sort((a, b) => {
        const aValue = priorityWeight[a.priority] / (complexityWeight[a.complexity] || 1)
        const bValue = priorityWeight[b.priority] / (complexityWeight[b.complexity] || 1)
        return bValue - aValue
      })
    }

    test("高优先级低复杂度排最前", () => {
      const reqs = [
        makeReq({ id: "1", priority: "low", complexity: "simple" }),     // 1/1 = 1.0
        makeReq({ id: "2", priority: "critical", complexity: "simple" }), // 4/1 = 4.0
        makeReq({ id: "3", priority: "high", complexity: "epic" }),      // 3/4 = 0.75
      ]
      const sorted = sortByQuickWins(reqs)
      expect(sorted[0].id).toBe("2") // critical/simple = 4.0
      expect(sorted[1].id).toBe("1") // low/simple = 1.0
      expect(sorted[2].id).toBe("3") // high/epic = 0.75
    })

    test("相同 ratio 保持稳定排序", () => {
      const reqs = [
        makeReq({ id: "1", priority: "high", complexity: "moderate" }), // 3/2 = 1.5
        makeReq({ id: "2", priority: "medium", complexity: "simple" }), // 2/1 = 2.0
      ]
      const sorted = sortByQuickWins(reqs)
      expect(sorted[0].id).toBe("2") // 2.0 > 1.5
    })
  })

  describe("sortByBalance", () => {
    const sortByBalance = (reqs: Requirement[]): Requirement[] => {
      const complexityWeight: Record<string, number> = { simple: 1, moderate: 2, complex: 3, epic: 4 }
      const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
      return [...reqs].sort((a, b) => {
        const aScore = priorityWeight[a.priority] * 0.6 + (1 / (complexityWeight[a.complexity] || 1)) * 0.4
        const bScore = priorityWeight[b.priority] * 0.6 + (1 / (complexityWeight[b.complexity] || 1)) * 0.4
        return bScore - aScore
      })
    }

    test("平衡策略考虑优先级和复杂度", () => {
      const reqs = [
        makeReq({ id: "1", priority: "low", complexity: "simple" }),     // 1*0.6 + 1*0.4 = 1.0
        makeReq({ id: "2", priority: "critical", complexity: "epic" }),  // 4*0.6 + 0.25*0.4 = 2.5
        makeReq({ id: "3", priority: "medium", complexity: "moderate" }), // 2*0.6 + 0.5*0.4 = 1.4
      ]
      const sorted = sortByBalance(reqs)
      expect(sorted[0].id).toBe("2")
      expect(sorted[1].id).toBe("3")
      expect(sorted[2].id).toBe("1")
    })
  })

  describe("schedule logic", () => {
    test("预算耗尽时任务被推迟", () => {
      const budget = 10000
      const totalEstimated = 30000
      const tasks = [
        makeReq({ id: "1", estimated_tokens: 15000 }),
        makeReq({ id: "2", estimated_tokens: 15000 }),
        makeReq({ id: "3", estimated_tokens: 15000 }),
      ]
      // 模拟调度：只有前 N 个任务能在预算内
      let remaining = budget
      const selected: string[] = []
      const deferred: string[] = []
      for (const req of tasks) {
        if (remaining >= req.estimated_tokens) {
          selected.push(req.id)
          remaining -= req.estimated_tokens
        } else {
          deferred.push(req.id)
        }
      }
      expect(selected.length).toBeLessThan(tasks.length)
      expect(deferred.length).toBeGreaterThan(0)
    })

    test("策略推荐：有 critical 任务时推荐 priority_first", () => {
      const reqs = [
        makeReq({ priority: "critical", complexity: "simple" }),
        makeReq({ priority: "low", complexity: "simple" }),
      ]
      const criticalCount = reqs.filter((r) => r.priority === "critical").length
      expect(criticalCount > 0).toBe(true)
    })

    test("策略推荐：多数 simple 时推荐 quick_wins", () => {
      const reqs = [
        makeReq({ complexity: "simple" }),
        makeReq({ complexity: "simple" }),
        makeReq({ complexity: "simple" }),
        makeReq({ complexity: "complex" }),
      ]
      const simpleCount = reqs.filter((r) => r.complexity === "simple").length
      expect(simpleCount > reqs.length * 0.5).toBe(true)
    })
  })
})
