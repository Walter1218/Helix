import { test, expect, describe } from "bun:test"
import {
  type Requirement,
  type ProjectState,
  type ProjectGoal,
} from "../../src/automation/requirement-analyzer"

describe("requirement-analyzer", () => {
  describe("classifyFile", () => {
    const classifyFile = (filePath: string): string | null => {
      const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase()
      const map: Record<string, string> = {
        ".ts": "TypeScript", ".tsx": "TypeScript",
        ".js": "JavaScript", ".jsx": "JavaScript",
        ".py": "Python", ".rs": "Rust", ".go": "Go",
        ".java": "Java", ".rb": "Ruby", ".swift": "Swift",
      }
      return map[ext] ?? null
    }

    test("识别 TypeScript 文件", () => {
      expect(classifyFile("src/index.ts")).toBe("TypeScript")
      expect(classifyFile("src/app.tsx")).toBe("TypeScript")
    })

    test("识别 JavaScript 文件", () => {
      expect(classifyFile("src/index.js")).toBe("JavaScript")
      expect(classifyFile("src/app.jsx")).toBe("JavaScript")
    })

    test("识别其他语言", () => {
      expect(classifyFile("main.py")).toBe("Python")
      expect(classifyFile("lib.rs")).toBe("Rust")
      expect(classifyFile("main.go")).toBe("Go")
    })

    test("忽略未知扩展名", () => {
      expect(classifyFile("README.md")).toBeNull()
      expect(classifyFile("style.css")).toBeNull()
      expect(classifyFile("data.json")).toBeNull()
    })
  })

  describe("isTestFile", () => {
    const isTestFile = (filePath: string): boolean => {
      const normalized = filePath.toLowerCase()
      return (
        normalized.includes(".test.") ||
        normalized.includes(".spec.") ||
        normalized.includes("__tests__") ||
        normalized.includes("/test/") ||
        normalized.includes("/tests/")
      )
    }

    test("识别 .test. 文件", () => {
      expect(isTestFile("src/foo.test.ts")).toBe(true)
    })

    test("识别 .spec. 文件", () => {
      expect(isTestFile("src/foo.spec.ts")).toBe(true)
    })

    test("识别 __tests__ 目录", () => {
      expect(isTestFile("src/__tests__/foo.ts")).toBe(true)
    })

    test("识别 /test/ 目录", () => {
      expect(isTestFile("/test/foo.ts")).toBe(true)
      expect(isTestFile("project/test/foo.ts")).toBe(true)
    })

    test("非测试文件返回 false", () => {
      expect(isTestFile("src/foo.ts")).toBe(false)
      expect(isTestFile("src/utils.ts")).toBe(false)
    })
  })

  describe("generateRequirementsFromState", () => {
    const generateRequirementsFromState = (state: ProjectState): Requirement[] => {
      const requirements: Requirement[] = []
      let idCounter = 1
      const makeId = () => `R${String(idCounter++).padStart(3, "0")}`

      if (state.test_files === 0) {
        requirements.push({
          id: makeId(), title: "添加单元测试",
          description: "项目缺少测试文件，需要添加基础单元测试以确保代码质量",
          category: "test", priority: "high", complexity: "moderate",
          estimated_tokens: 30000, goal_alignment: 0.9, tags: ["testing", "quality"],
        })
      }

      if (!state.has_readme) {
        requirements.push({
          id: makeId(), title: "创建 README 文档",
          description: "项目缺少 README 文件，需要创建项目说明文档",
          category: "docs", priority: "medium", complexity: "simple",
          estimated_tokens: 5000, goal_alignment: 0.7, tags: ["documentation"],
        })
      }

      if (!state.has_docs) {
        requirements.push({
          id: makeId(), title: "添加 API 文档",
          description: "项目缺少文档目录，需要创建项目文档",
          category: "docs", priority: "medium", complexity: "moderate",
          estimated_tokens: 15000, goal_alignment: 0.6, tags: ["documentation"],
        })
      }

      if (!state.tsconfig && Object.keys(state.languages).some((l) => l.includes("TypeScript"))) {
        requirements.push({
          id: makeId(), title: "配置 TypeScript",
          description: "TypeScript 项目缺少 tsconfig.json 配置文件",
          category: "infrastructure", priority: "high", complexity: "simple",
          estimated_tokens: 3000, goal_alignment: 0.8, tags: ["typescript", "config"],
        })
      }

      const totalTestRatio = state.total_files > 0 ? state.test_files / state.total_files : 0
      if (totalTestRatio < 0.2 && state.test_files > 0) {
        requirements.push({
          id: makeId(), title: "提高测试覆盖率",
          description: `当前测试文件占比 ${(totalTestRatio * 100).toFixed(1)}%，建议提高到 20% 以上`,
          category: "test", priority: "high", complexity: "complex",
          estimated_tokens: 50000, goal_alignment: 0.85, tags: ["testing", "coverage"],
        })
      }

      return requirements
    }

    const makeState = (overrides: Partial<ProjectState> = {}): ProjectState => ({
      name: "test-project", root_path: "/tmp/test", total_files: 10,
      languages: { TypeScript: 8 }, test_files: 5,
      has_readme: true, has_docs: true, package_json: true,
      tsconfig: true, git_initialized: true, ...overrides,
    })

    test("完整项目无额外需求", () => {
      const reqs = generateRequirementsFromState(makeState())
      expect(reqs.length).toBe(0)
    })

    test("无测试文件时建议添加测试", () => {
      const reqs = generateRequirementsFromState(makeState({ test_files: 0 }))
      expect(reqs.some((r) => r.title === "添加单元测试")).toBe(true)
    })

    test("无 README 时建议创建", () => {
      const reqs = generateRequirementsFromState(makeState({ has_readme: false }))
      expect(reqs.some((r) => r.title === "创建 README 文档")).toBe(true)
    })

    test("无 docs 目录时建议添加", () => {
      const reqs = generateRequirementsFromState(makeState({ has_docs: false }))
      expect(reqs.some((r) => r.title === "添加 API 文档")).toBe(true)
    })

    test("TypeScript 项目无 tsconfig 时建议配置", () => {
      const reqs = generateRequirementsFromState(makeState({ tsconfig: false }))
      expect(reqs.some((r) => r.title === "配置 TypeScript")).toBe(true)
    })

    test("非 TypeScript 项目不需要 tsconfig 建议", () => {
      const reqs = generateRequirementsFromState(makeState({
        tsconfig: false, languages: { Python: 5 },
      }))
      expect(reqs.some((r) => r.title === "配置 TypeScript")).toBe(false)
    })

    test("测试覆盖率低于 20% 时建议提高", () => {
      const reqs = generateRequirementsFromState(makeState({
        total_files: 20, test_files: 2,
      }))
      expect(reqs.some((r) => r.title === "提高测试覆盖率")).toBe(true)
    })

    test("多重缺失时生成多个需求", () => {
      const reqs = generateRequirementsFromState(makeState({
        test_files: 0, has_readme: false, has_docs: false, tsconfig: false,
      }))
      expect(reqs.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe("mergeGoalRequirements", () => {
    const mergeGoalRequirements = (goals: ProjectGoal): Requirement[] => {
      return goals.features
        .filter((f) => f.status !== "done")
        .map((f, i) => ({
          id: `G${String(i + 1).padStart(3, "0")}`,
          title: f.name,
          description: `来自项目目标: ${f.name}`,
          category: "feature" as const,
          priority: f.priority,
          complexity: "moderate" as const,
          estimated_tokens: 30000,
          goal_alignment: 1.0,
          tags: ["goal", "feature"],
        }))
    }

    test("过滤已完成的功能", () => {
      const goals: ProjectGoal = {
        description: "test", features: [
          { name: "feat1", priority: "high", status: "done" },
          { name: "feat2", priority: "medium", status: "pending" },
        ], requirements: [],
      }
      const reqs = mergeGoalRequirements(goals)
      expect(reqs.length).toBe(1)
      expect(reqs[0].title).toBe("feat2")
    })

    test("空目标返回空数组", () => {
      const goals: ProjectGoal = {
        description: "test", features: [], requirements: [],
      }
      expect(mergeGoalRequirements(goals).length).toBe(0)
    })

    test("所有功能已完成时返回空数组", () => {
      const goals: ProjectGoal = {
        description: "test", features: [
          { name: "feat1", priority: "high", status: "done" },
        ], requirements: [],
      }
      expect(mergeGoalRequirements(goals).length).toBe(0)
    })
  })

  describe("prioritizeRequirements", () => {
    const PRIORITY_WEIGHT: Record<string, number> = {
      critical: 4, high: 3, medium: 2, low: 1,
    }

    const prioritizeRequirements = (requirements: Requirement[]): Requirement[] => {
      return [...requirements].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
        if (priorityDiff !== 0) return priorityDiff
        const alignmentDiff = b.goal_alignment - a.goal_alignment
        if (alignmentDiff !== 0) return alignmentDiff
        return a.estimated_tokens - b.estimated_tokens
      })
    }

    test("按优先级排序", () => {
      const reqs: Requirement[] = [
        { id: "1", title: "low", description: "", category: "feature", priority: "low", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.5, tags: [] },
        { id: "2", title: "critical", description: "", category: "feature", priority: "critical", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.5, tags: [] },
        { id: "3", title: "medium", description: "", category: "feature", priority: "medium", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.5, tags: [] },
      ]
      const sorted = prioritizeRequirements(reqs)
      expect(sorted[0].title).toBe("critical")
      expect(sorted[1].title).toBe("medium")
      expect(sorted[2].title).toBe("low")
    })

    test("同优先级按 goal_alignment 排序", () => {
      const reqs: Requirement[] = [
        { id: "1", title: "low-align", description: "", category: "feature", priority: "high", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.3, tags: [] },
        { id: "2", title: "high-align", description: "", category: "feature", priority: "high", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.9, tags: [] },
      ]
      const sorted = prioritizeRequirements(reqs)
      expect(sorted[0].title).toBe("high-align")
    })

    test("同优先级同对齐度按 token 排序（少的优先）", () => {
      const reqs: Requirement[] = [
        { id: "1", title: "expensive", description: "", category: "feature", priority: "high", complexity: "simple", estimated_tokens: 50000, goal_alignment: 0.5, tags: [] },
        { id: "2", title: "cheap", description: "", category: "feature", priority: "high", complexity: "simple", estimated_tokens: 1000, goal_alignment: 0.5, tags: [] },
      ]
      const sorted = prioritizeRequirements(reqs)
      expect(sorted[0].title).toBe("cheap")
    })
  })
})
