import { Context, Effect, Layer } from "effect"
import { Config } from "@/config"
import { Log } from "@/util"
import path from "path"
import type { TaskPriority, TaskComplexity } from "@/task/schema"

const log = Log.create({ service: "requirement-analyzer" })

export interface ProjectState {
  name: string
  root_path: string
  total_files: number
  languages: Record<string, number>
  test_files: number
  has_readme: boolean
  has_docs: boolean
  package_json: boolean
  tsconfig: boolean
  git_initialized: boolean
}

export interface ProjectGoal {
  description: string
  features: Array<{
    name: string
    priority: TaskPriority
    status: "pending" | "in_progress" | "done"
  }>
  requirements: Array<{
    category: "performance" | "security" | "maintainability" | "scalability" | "testing" | "documentation"
    description: string
    priority: TaskPriority
  }>
}

export interface Requirement {
  id: string
  title: string
  description: string
  category: "feature" | "bugfix" | "refactor" | "test" | "docs" | "dependency" | "infrastructure"
  priority: TaskPriority
  complexity: TaskComplexity
  estimated_tokens: number
  goal_alignment: number
  tags: string[]
}

export interface Interface {
  readonly analyzeProject: (projectPath?: string) => Effect.Effect<ProjectState>
  readonly loadGoals: (projectPath?: string) => Effect.Effect<ProjectGoal | null>
  readonly identifyRequirements: (state: ProjectState, goals: ProjectGoal | null) => Effect.Effect<Requirement[]>
  readonly prioritizeRequirements: (requirements: Requirement[]) => Effect.Effect<Requirement[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/RequirementAnalyzer") {}

const LANG_EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".swift": "Swift",
}

function classifyFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  return LANG_EXTENSIONS[ext] ?? null
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase()
  return (
    normalized.includes(".test.") ||
    normalized.includes(".spec.") ||
    normalized.includes("__tests__") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/")
  )
}

function generateRequirementsFromState(state: ProjectState): Requirement[] {
  const requirements: Requirement[] = []
  let idCounter = 1

  const makeId = () => `R${String(idCounter++).padStart(3, "0")}`

  if (state.test_files === 0) {
    requirements.push({
      id: makeId(),
      title: "添加单元测试",
      description: "项目缺少测试文件，需要添加基础单元测试以确保代码质量",
      category: "test",
      priority: "high",
      complexity: "moderate",
      estimated_tokens: 30000,
      goal_alignment: 0.9,
      tags: ["testing", "quality"],
    })
  }

  if (!state.has_readme) {
    requirements.push({
      id: makeId(),
      title: "创建 README 文档",
      description: "项目缺少 README 文件，需要创建项目说明文档",
      category: "docs",
      priority: "medium",
      complexity: "simple",
      estimated_tokens: 5000,
      goal_alignment: 0.7,
      tags: ["documentation"],
    })
  }

  if (!state.has_docs) {
    requirements.push({
      id: makeId(),
      title: "添加 API 文档",
      description: "项目缺少文档目录，需要创建项目文档",
      category: "docs",
      priority: "medium",
      complexity: "moderate",
      estimated_tokens: 15000,
      goal_alignment: 0.6,
      tags: ["documentation"],
    })
  }

  if (!state.tsconfig && Object.keys(state.languages).some((l) => l.includes("TypeScript"))) {
    requirements.push({
      id: makeId(),
      title: "配置 TypeScript",
      description: "TypeScript 项目缺少 tsconfig.json 配置文件",
      category: "infrastructure",
      priority: "high",
      complexity: "simple",
      estimated_tokens: 3000,
      goal_alignment: 0.8,
      tags: ["typescript", "config"],
    })
  }

  const totalTestRatio = state.total_files > 0 ? state.test_files / state.total_files : 0
  if (totalTestRatio < 0.2 && state.test_files > 0) {
    requirements.push({
      id: makeId(),
      title: "提高测试覆盖率",
      description: `当前测试文件占比 ${(totalTestRatio * 100).toFixed(1)}%，建议提高到 20% 以上`,
      category: "test",
      priority: "high",
      complexity: "complex",
      estimated_tokens: 50000,
      goal_alignment: 0.85,
      tags: ["testing", "coverage"],
    })
  }

  return requirements
}

function mergeGoalRequirements(goals: ProjectGoal): Requirement[] {
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

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const analyzeProject = Effect.fn("RequirementAnalyzer.analyzeProject")(function* (projectPath?: string) {
      const cfg = yield* config.get()
      const rootPath = projectPath ?? process.cwd()

      log.info("analyzing project", { path: rootPath })

      const state = yield* Effect.promise(async () => {
        const languages: Record<string, number> = {}
        let totalFiles = 0
        let testFiles = 0
        let hasReadme = false
        let hasDocs = false
        let packageJson = false
        let tsconfig = false
        let gitInitialized = false

        try {
          const { readdirSync, existsSync } = await import("fs")

          const walk = (dir: string, depth = 0) => {
            if (depth > 5) return
            try {
              const entries = readdirSync(dir, { withFileTypes: true })
              for (const entry of entries) {
                if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                  walk(fullPath, depth + 1)
                } else {
                  totalFiles++
                  const lang = classifyFile(entry.name)
                  if (lang) languages[lang] = (languages[lang] ?? 0) + 1
                  if (isTestFile(fullPath)) testFiles++
                }
              }
            } catch {}
          }

          walk(rootPath)

          hasReadme = existsSync(path.join(rootPath, "README.md")) || existsSync(path.join(rootPath, "readme.md"))
          hasDocs = existsSync(path.join(rootPath, "docs"))
          packageJson = existsSync(path.join(rootPath, "package.json"))
          tsconfig = existsSync(path.join(rootPath, "tsconfig.json"))
          gitInitialized = existsSync(path.join(rootPath, ".git"))
        } catch (e) {
          log.warn("project analysis error", { error: String(e) })
        }

        return {
          name: path.basename(rootPath),
          root_path: rootPath,
          total_files: totalFiles,
          languages,
          test_files: testFiles,
          has_readme: hasReadme,
          has_docs: hasDocs,
          package_json: packageJson,
          tsconfig,
          git_initialized: gitInitialized,
        } satisfies ProjectState
      })

      log.info("project analysis complete", {
        files: state.total_files,
        tests: state.test_files,
        languages: Object.keys(state.languages).length,
      })

      return state
    })

    const loadGoals = Effect.fn("RequirementAnalyzer.loadGoals")(function* (projectPath?: string) {
      const rootPath = projectPath ?? process.cwd()
      const goalsPath = path.join(rootPath, ".mimocode", "project-goals.json")

      return yield* Effect.promise(async () => {
        try {
          const { readFileSync } = await import("fs")
          const content = readFileSync(goalsPath, "utf-8")
          const goals = JSON.parse(content) as ProjectGoal
          log.info("loaded project goals", { features: goals.features?.length ?? 0 })
          return goals
        } catch {
          log.info("no project goals file found")
          return null
        }
      })
    })

    const identifyRequirements = Effect.fn("RequirementAnalyzer.identifyRequirements")(function* (
      state: ProjectState,
      goals: ProjectGoal | null,
    ) {
      const stateReqs = generateRequirementsFromState(state)
      const goalReqs = goals ? mergeGoalRequirements(goals) : []
      const all = [...goalReqs, ...stateReqs]

      log.info("requirements identified", { total: all.length, fromGoals: goalReqs.length, fromState: stateReqs.length })
      return all
    })

    const prioritizeRequirements = Effect.fn("RequirementAnalyzer.prioritizeRequirements")(function* (
      requirements: Requirement[],
    ) {
      const sorted = [...requirements].sort((a, b) => {
        const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
        if (priorityDiff !== 0) return priorityDiff
        const alignmentDiff = b.goal_alignment - a.goal_alignment
        if (alignmentDiff !== 0) return alignmentDiff
        return a.estimated_tokens - b.estimated_tokens
      })
      return sorted
    })

    return Service.of({
      analyzeProject,
      loadGoals,
      identifyRequirements,
      prioritizeRequirements,
    })
  }),
)

export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Config.defaultLayer)))

export * as RequirementAnalyzer from "./requirement-analyzer"
