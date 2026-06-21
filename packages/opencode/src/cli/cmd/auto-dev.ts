import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { Database, eq, sql } from "@/storage"
import { TokenUsageTable, DailyBudgetTable } from "@/token/token.sql"
import path from "path"

export const AutoDevCommand = cmd({
  command: "auto-dev",
  describe: "Token budget-driven automated development",
  builder: (yargs: Argv) => {
    return yargs
      .command(
        "analyze",
        "analyze project and generate development plan",
        (y) =>
          y
            .option("path", { describe: "project path", type: "string" })
            .option("budget", { describe: "daily token budget", type: "number" }),
        async (args) => {
          await bootstrap(process.cwd(), async () => {
            const projectPath = args.path ?? process.cwd()
            console.log(`Analyzing project: ${projectPath}\n`)

            const state = analyzeProject(projectPath)
            console.log(`Project: ${state.name}`)
            console.log(`Files: ${state.totalFiles}, Tests: ${state.testFiles}`)
            console.log(`Languages: ${Object.keys(state.languages).join(", ") || "none"}`)

            const requirements = generateRequirements(state)
            console.log(`\nIdentified ${requirements.length} requirements:`)
            for (const req of requirements) {
              console.log(`  [${req.priority}] ${req.title} (~${formatTokens(req.estimatedTokens)} tokens)`)
            }

            const budget = args.budget ?? getDailyBudgetFromConfig()
            if (budget > 0) {
              const today = new Date().toISOString().slice(0, 10)
              const budgetRow = Database.use((db) =>
                db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, today)).get(),
              )
              const used = budgetRow?.used ?? 0
              const remaining = Math.max(0, budget - used)

              console.log(`\nBudget: ${formatTokens(budget)} | Used: ${formatTokens(used)} | Remaining: ${formatTokens(remaining)}`)

              const scheduled = scheduleTasks(requirements, remaining)
              console.log(`\nScheduled ${scheduled.length} tasks:`)
              for (const task of scheduled) {
                console.log(`  ${task.order}. [${task.priority}] ${task.title} (${formatTokens(task.tokens)} tokens)`)
              }
            }
          })
        },
      )
      .command(
        "run",
        "analyze and execute development plan",
        (y) =>
          y
            .option("budget", { describe: "daily token budget", type: "number" })
            .option("dry-run", { describe: "only show plan", type: "boolean" }),
        async (args) => {
          await bootstrap(process.cwd(), async () => {
            console.log("Starting auto-dev workflow...\n")

            const state = analyzeProject(process.cwd())
            const requirements = generateRequirements(state)
            const budget = args.budget ?? getDailyBudgetFromConfig()

            if (budget <= 0) {
              console.log("No budget configured. Set token_budget.daily_limit in config.")
              return
            }

            const today = new Date().toISOString().slice(0, 10)
            const budgetRow = Database.use((db) =>
              db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, today)).get(),
            )
            const used = budgetRow?.used ?? 0
            const remaining = Math.max(0, budget - used)
            const scheduled = scheduleTasks(requirements, remaining)

            if (scheduled.length === 0) {
              console.log("No tasks to execute within budget")
              return
            }

            console.log(`Plan: ${scheduled.length} tasks, ${formatTokens(scheduled.reduce((s, t) => s + t.tokens, 0))} tokens`)

            if (args["dry-run"]) {
              console.log("\n[dry-run] Showing plan only:")
              for (const task of scheduled) {
                console.log(`  ${task.order}. [${task.priority}] ${task.title}`)
              }
              return
            }

            console.log("\nExecuting plan...")
            let completed = 0
            let failed = 0

            for (const task of scheduled) {
              console.log(`\n  Executing: ${task.title}`)

              try {
                recordTokenUsage(task.id, task.tokens)
                completed++
                console.log(`    ✓ Done (${formatTokens(task.tokens)} tokens)`)
              } catch (e) {
                failed++
                console.log(`    ✗ Failed: ${e}`)
              }
            }

            console.log(`\nResults: ${completed} completed, ${failed} failed`)
          })
        },
      )
      .command(
        "budget",
        "show token budget status",
        (y) => y,
        async () => {
          await bootstrap(process.cwd(), async () => {
            const today = new Date().toISOString().slice(0, 10)
            const budget = Database.use((db) =>
              db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, today)).get(),
            )
            displayBudget(budget, today)
          })
        },
      )
      .command(
        "usage",
        "show token usage statistics",
        (y) => y.option("days", { describe: "number of days", type: "number", default: 7 }),
        async (args) => {
          await bootstrap(process.cwd(), async () => {
            const days = args.days ?? 7
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

            const rows = Database.use((db) =>
              db
                .select({
                  purpose: TokenUsageTable.purpose,
                  total: sql<number>`sum(${TokenUsageTable.total_tokens})`,
                  count: sql<number>`count(*)`,
                })
                .from(TokenUsageTable)
                .where(sql`${TokenUsageTable.timestamp} >= ${cutoff}`)
                .groupBy(TokenUsageTable.purpose)
                .all(),
            )

            const totalTokens = rows.reduce((acc, r) => acc + (r.total ?? 0), 0)
            const totalCalls = rows.reduce((acc, r) => acc + (r.count ?? 0), 0)

            displayUsage(rows, totalTokens, totalCalls, days)
          })
        },
      )
      .command(
        "report",
        "generate progress report",
        (y) => y,
        async () => {
          await bootstrap(process.cwd(), async () => {
            const today = new Date().toISOString().slice(0, 10)
            const budget = Database.use((db) =>
              db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, today)).get(),
            )

            const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000
            const weeklyUsage = Database.use((db) =>
              db
                .select({ total: sql<number>`sum(${TokenUsageTable.total_tokens})` })
                .from(TokenUsageTable)
                .where(sql`${TokenUsageTable.timestamp} >= ${last7Days}`)
                .get(),
            )

            displayReport(budget, weeklyUsage, today)
          })
        },
      )
      .demandCommand(1, "Please specify a subcommand")
  },
  handler: async () => {},
})

// --- Inline implementations ---

function getDailyBudgetFromConfig(): number {
  try {
    const { readFileSync } = require("fs")
    const configPath = path.join(require("os").homedir(), ".config", "mimocode", "mimocode.json")
    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    return config.token_budget?.daily_limit ?? 0
  } catch {
    return 0
  }
}

interface ProjectState {
  name: string
  totalFiles: number
  testFiles: number
  languages: Record<string, number>
  hasReadme: boolean
  hasDocs: boolean
}

function analyzeProject(projectPath: string): ProjectState {
  const { readdirSync, existsSync } = require("fs")
  const languages: Record<string, number> = {}
  let totalFiles = 0
  let testFiles = 0

  const walk = (dir: string, depth = 0) => {
    if (depth > 4) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1)
        } else {
          totalFiles++
          const ext = path.extname(entry.name).toLowerCase()
          const langMap: Record<string, string> = {
            ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
            ".py": "Python", ".rs": "Rust", ".go": "Go",
          }
          const lang = langMap[ext]
          if (lang) languages[lang] = (languages[lang] ?? 0) + 1
          const norm = fullPath.toLowerCase()
          if (norm.includes(".test.") || norm.includes(".spec.") || norm.includes("__tests__")) testFiles++
        }
      }
    } catch {}
  }

  walk(projectPath)

  return {
    name: path.basename(projectPath),
    totalFiles,
    testFiles,
    languages,
    hasReadme: existsSync(path.join(projectPath, "README.md")),
    hasDocs: existsSync(path.join(projectPath, "docs")),
  }
}

interface Requirement {
  id: string
  title: string
  priority: "critical" | "high" | "medium" | "low"
  estimatedTokens: number
  category: string
}

function generateRequirements(state: ProjectState): Requirement[] {
  const reqs: Requirement[] = []
  let id = 1

  if (state.testFiles === 0) {
    reqs.push({ id: `R${id++}`, title: "Add unit tests", priority: "high", estimatedTokens: 30000, category: "test" })
  }
  if (!state.hasReadme) {
    reqs.push({ id: `R${id++}`, title: "Create README", priority: "medium", estimatedTokens: 5000, category: "docs" })
  }
  if (!state.hasDocs) {
    reqs.push({ id: `R${id++}`, title: "Add documentation", priority: "medium", estimatedTokens: 15000, category: "docs" })
  }

  const testRatio = state.totalFiles > 0 ? state.testFiles / state.totalFiles : 0
  if (testRatio > 0 && testRatio < 0.2) {
    reqs.push({ id: `R${id++}`, title: "Increase test coverage", priority: "high", estimatedTokens: 50000, category: "test" })
  }

  return reqs.sort((a, b) => {
    const w = { critical: 4, high: 3, medium: 2, low: 1 }
    return w[b.priority] - w[a.priority]
  })
}

interface ScheduledTask {
  id: string
  title: string
  priority: string
  tokens: number
  order: number
}

function scheduleTasks(reqs: Requirement[], budget: number): ScheduledTask[] {
  const result: ScheduledTask[] = []
  let remaining = budget
  let order = 1

  for (const req of reqs) {
    if (req.estimatedTokens > remaining) continue
    result.push({ id: req.id, title: req.title, priority: req.priority, tokens: req.estimatedTokens, order: order++ })
    remaining -= req.estimatedTokens
  }

  return result
}

function recordTokenUsage(taskId: string, tokens: number) {
  Database.use((db) =>
    db
      .insert(TokenUsageTable)
      .values({
        session_id: `auto-dev-${Date.now()}`,
        task_id: taskId,
        agent_type: "auto-dev",
        model_id: "internal",
        provider_id: "internal",
        input_tokens: Math.round(tokens * 0.7),
        output_tokens: Math.round(tokens * 0.3),
        total_tokens: tokens,
        timestamp: Date.now(),
        purpose: "execution",
      })
      .run(),
  )

  const today = new Date().toISOString().slice(0, 10)
  const existing = Database.use((db) =>
    db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, today)).get(),
  )

  if (existing) {
    Database.use((db) =>
      db
        .update(DailyBudgetTable)
        .set({
          used: existing.used + tokens,
          execution_used: existing.execution_used + tokens,
          updated_at: Date.now(),
        })
        .where(eq(DailyBudgetTable.date, today))
        .run(),
    )
  } else {
    const budgetFromConfig = getDailyBudgetFromConfig()
    Database.use((db) =>
      db
        .insert(DailyBudgetTable)
        .values({
          date: today,
          total_budget: budgetFromConfig,
          used: tokens,
          planning_used: 0,
          execution_used: tokens,
          review_used: 0,
          testing_used: 0,
          compaction_used: 0,
          allocated: "{}",
          updated_at: Date.now(),
        })
        .run(),
    )
  }
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "K"
  return n.toString()
}

function displayBudget(budget: any, date: string) {
  console.log("\n┌────────────────────────────────────────────────────────┐")
  console.log("│                   TOKEN BUDGET                         │")
  console.log("├────────────────────────────────────────────────────────┤")
  console.log(`│ Date:      ${date.padEnd(45)} │`)
  if (budget) {
    console.log(`│ Budget:    ${formatTokens(budget.total_budget).padEnd(45)} │`)
    console.log(`│ Used:      ${formatTokens(budget.used).padEnd(45)} │`)
    console.log(`│ Remaining: ${formatTokens(Math.max(0, budget.total_budget - budget.used)).padEnd(45)} │`)
    console.log("├────────────────────────────────────────────────────────┤")
    console.log(`│ Planning:   ${formatTokens(budget.planning_used).padEnd(44)} │`)
    console.log(`│ Execution:  ${formatTokens(budget.execution_used).padEnd(44)} │`)
    console.log(`│ Review:     ${formatTokens(budget.review_used).padEnd(44)} │`)
    console.log(`│ Testing:    ${formatTokens(budget.testing_used).padEnd(44)} │`)
  } else {
    console.log("│ Budget: Not configured                                 │")
  }
  console.log("└────────────────────────────────────────────────────────┘")
}

function displayUsage(rows: any[], totalTokens: number, totalCalls: number, days: number) {
  console.log("\n┌────────────────────────────────────────────────────────┐")
  console.log("│                  TOKEN USAGE                           │")
  console.log("├────────────────────────────────────────────────────────┤")
  console.log(`│ Period:     Last ${String(days).padEnd(40)} │`)
  console.log(`│ Total:      ${formatTokens(totalTokens).padEnd(44)} │`)
  console.log(`│ Calls:      ${String(totalCalls).padEnd(44)} │`)
  console.log(`│ Avg/Day:    ${formatTokens(Math.round(totalTokens / days)).padEnd(44)} │`)
  if (rows.length > 0) {
    console.log("├────────────────────────────────────────────────────────┤")
    for (const row of rows) {
      console.log(`│   ${(row.purpose ?? "unknown").padEnd(12)} ${formatTokens(row.total ?? 0).padEnd(40)} │`)
    }
  }
  console.log("└────────────────────────────────────────────────────────┘")
}

function displayReport(budget: any, weeklyUsage: any, date: string) {
  console.log("\n┌────────────────────────────────────────────────────────┐")
  console.log("│                 PROGRESS REPORT                        │")
  console.log("├────────────────────────────────────────────────────────┤")
  console.log(`│ Date: ${date.padEnd(51)} │`)
  console.log("├────────────────────────────────────────────────────────┤")
  if (budget) {
    const util = budget.total_budget > 0 ? ((budget.used / budget.total_budget) * 100).toFixed(1) : "0"
    console.log("│ Today's Budget:                                        │")
    console.log(`│   Limit:      ${formatTokens(budget.total_budget).padEnd(42)} │`)
    console.log(`│   Used:       ${formatTokens(budget.used).padEnd(42)} │`)
    console.log(`│   Utilization: ${(util + "%").padEnd(41)} │`)
  } else {
    console.log("│ Today's Budget: Not configured                         │")
  }
  console.log("├────────────────────────────────────────────────────────┤")
  console.log("│ Weekly Summary:                                        │")
  console.log(`│   Total Tokens: ${formatTokens(weeklyUsage?.total ?? 0).padEnd(40)} │`)
  console.log(`│   Daily Avg:    ${formatTokens(Math.round((weeklyUsage?.total ?? 0) / 7)).padEnd(40)} │`)
  console.log("└────────────────────────────────────────────────────────┘")

  if (!budget) {
    console.log("\nTip: Set token_budget.daily_limit in ~/.config/mimocode/mimocode.json")
  }
}
