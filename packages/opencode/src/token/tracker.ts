import { Context, Effect, Layer } from "effect"
import { Database, eq, and, gte, lte, sql } from "@/storage"
import { Config } from "@/config"
import { TokenUsageTable, DailyBudgetTable } from "./token.sql"
import { Log } from "@/util"

const log = Log.create({ service: "token-tracker" })

export interface TokenUsage {
  session_id: string
  task_id?: string
  agent_type?: string
  model_id: string
  provider_id: string
  input_tokens: number
  output_tokens: number
  timestamp?: number
  purpose?: "planning" | "execution" | "review" | "testing" | "compaction"
}

export interface DailyBudget {
  date: string
  total_budget: number
  used: number
  remaining: number
  planning_used: number
  execution_used: number
  review_used: number
  testing_used: number
  compaction_used: number
  allocated: Record<string, number>
}

export interface UsageStats {
  period_days: number
  total_tokens: number
  avg_daily: number
  by_purpose: Record<string, number>
  by_model: Record<string, number>
  by_day: Array<{ date: string; tokens: number }>
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function dateRange(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function dateToTimestamp(dateStr: string, endOfDay = false): number {
  const d = new Date(dateStr + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"))
  return d.getTime()
}

export interface Interface {
  readonly recordUsage: (usage: TokenUsage) => Effect.Effect<void>
  readonly getDailyBudget: (date?: string) => Effect.Effect<DailyBudget>
  readonly allocateTokens: (taskId: string, amount: number) => Effect.Effect<boolean>
  readonly getTaskUsage: (taskId: string) => Effect.Effect<number>
  readonly getUsageStats: (days?: number) => Effect.Effect<UsageStats>
  readonly getRemainingBudget: () => Effect.Effect<number>
  readonly canAfford: (estimatedTokens: number) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TokenTracker") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const ensureBudgetRow = (date: string, totalBudget: number) => {
      const existing = Database.use((db) =>
        db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, date)).get(),
      )
      if (!existing) {
        Database.use((db) =>
          db
            .insert(DailyBudgetTable)
            .values({
              date,
              total_budget: totalBudget,
              used: 0,
              planning_used: 0,
              execution_used: 0,
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

    const recordUsage = Effect.fn("TokenTracker.recordUsage")(function* (usage: TokenUsage) {
      const cfg = yield* config.get()
      const dailyLimit = cfg.token_budget?.daily_limit ?? 0
      const now = usage.timestamp ?? Date.now()
      const date = new Date(now).toISOString().slice(0, 10)
      const total = usage.input_tokens + usage.output_tokens
      const purpose = usage.purpose ?? "execution"

      log.info("token usage recorded", {
        session: usage.session_id,
        task: usage.task_id,
        model: usage.model_id,
        input: usage.input_tokens,
        output: usage.output_tokens,
        total,
        purpose,
      })

      Database.use((db) =>
        db
          .insert(TokenUsageTable)
          .values({
            session_id: usage.session_id,
            task_id: usage.task_id ?? null,
            agent_type: usage.agent_type ?? "build",
            model_id: usage.model_id,
            provider_id: usage.provider_id,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: total,
            timestamp: now,
            purpose,
          })
          .run(),
      )

      if (dailyLimit > 0) {
        ensureBudgetRow(date, dailyLimit)
        const purposeCol = `${purpose}_used` as
          | "planning_used"
          | "execution_used"
          | "review_used"
          | "testing_used"
          | "compaction_used"
        Database.use((db) =>
          db
            .update(DailyBudgetTable)
            .set({
              used: sql`${DailyBudgetTable.used} + ${total}`,
              [purposeCol]: sql`${DailyBudgetTable[purposeCol]} + ${total}`,
              updated_at: now,
            })
            .where(eq(DailyBudgetTable.date, date))
            .run(),
        )
      }
    })

    const getDailyBudget = Effect.fn("TokenTracker.getDailyBudget")(function* (date?: string) {
      const cfg = yield* config.get()
      const dailyLimit = cfg.token_budget?.daily_limit ?? 0
      const d = date ?? todayStr()

      if (dailyLimit <= 0) {
        return {
          date: d,
          total_budget: 0,
          used: 0,
          remaining: 0,
          planning_used: 0,
          execution_used: 0,
          review_used: 0,
          testing_used: 0,
          compaction_used: 0,
          allocated: {},
        }
      }

      ensureBudgetRow(d, dailyLimit)
      const row = Database.use((db) =>
        db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, d)).get(),
      )

      if (!row) {
        return {
          date: d,
          total_budget: dailyLimit,
          used: 0,
          remaining: dailyLimit,
          planning_used: 0,
          execution_used: 0,
          review_used: 0,
          testing_used: 0,
          compaction_used: 0,
          allocated: {},
        }
      }

      return {
        date: d,
        total_budget: row.total_budget,
        used: row.used,
        remaining: Math.max(0, row.total_budget - row.used),
        planning_used: row.planning_used,
        execution_used: row.execution_used,
        review_used: row.review_used,
        testing_used: row.testing_used,
        compaction_used: row.compaction_used,
        allocated: row.allocated ? JSON.parse(row.allocated) : {},
      }
    })

    const allocateTokens = Effect.fn("TokenTracker.allocateTokens")(function* (taskId: string, amount: number) {
      const d = todayStr()
      const cfg = yield* config.get()
      const dailyLimit = cfg.token_budget?.daily_limit ?? 0
      if (dailyLimit <= 0) return false

      ensureBudgetRow(d, dailyLimit)
      const row = Database.use((db) =>
        db.select().from(DailyBudgetTable).where(eq(DailyBudgetTable.date, d)).get(),
      )
      if (!row) return false

      const allocated: Record<string, number> = row.allocated ? JSON.parse(row.allocated) : {}
      const currentAllocation = allocated[taskId] ?? 0
      const totalAllocated = Object.values(allocated).reduce((a, b) => a + b, 0)
      const remaining = row.total_budget - row.used - totalAllocated + currentAllocation

      if (amount > remaining) {
        log.warn("insufficient budget for allocation", { taskId, requested: amount, remaining })
        return false
      }

      allocated[taskId] = amount
      Database.use((db) =>
        db
          .update(DailyBudgetTable)
          .set({ allocated: JSON.stringify(allocated), updated_at: Date.now() })
          .where(eq(DailyBudgetTable.date, d))
          .run(),
      )
      return true
    })

    const getTaskUsage = Effect.fn("TokenTracker.getTaskUsage")(function* (taskId: string) {
      const d = todayStr()
      const startTs = dateToTimestamp(d)
      const endTs = dateToTimestamp(d, true)

      const rows = Database.use((db) =>
        db
          .select({ total: sql<number>`sum(${TokenUsageTable.total_tokens})` })
          .from(TokenUsageTable)
          .where(
            and(
              eq(TokenUsageTable.task_id, taskId),
              gte(TokenUsageTable.timestamp, startTs),
              lte(TokenUsageTable.timestamp, endTs),
            ),
          )
          .get(),
      )
      return rows?.total ?? 0
    })

    const getUsageStats = Effect.fn("TokenTracker.getUsageStats")(function* (days?: number) {
      const d = days ?? 7
      const { start, end } = dateRange(d)
      const startTs = dateToTimestamp(start)
      const endTs = dateToTimestamp(end, true)

      const rows = Database.use((db) =>
        db
          .select({
            total: sql<number>`sum(${TokenUsageTable.total_tokens})`,
            purpose: TokenUsageTable.purpose,
            model: TokenUsageTable.model_id,
          })
          .from(TokenUsageTable)
          .where(and(gte(TokenUsageTable.timestamp, startTs), lte(TokenUsageTable.timestamp, endTs)))
          .groupBy(TokenUsageTable.purpose, TokenUsageTable.model_id)
          .all(),
      )

      const dailyRows = Database.use((db) =>
        db
          .select({
            date: sql<string>`date(${TokenUsageTable.timestamp} / 1000, 'unixepoch')`,
            tokens: sql<number>`sum(${TokenUsageTable.total_tokens})`,
          })
          .from(TokenUsageTable)
          .where(and(gte(TokenUsageTable.timestamp, startTs), lte(TokenUsageTable.timestamp, endTs)))
          .groupBy(sql`date(${TokenUsageTable.timestamp} / 1000, 'unixepoch')`)
          .all(),
      )

      const total = rows.reduce((acc, r) => acc + (r.total ?? 0), 0)
      const byPurpose: Record<string, number> = {}
      const byModel: Record<string, number> = {}
      for (const r of rows) {
        if (r.purpose) byPurpose[r.purpose] = (byPurpose[r.purpose] ?? 0) + (r.total ?? 0)
        if (r.model) byModel[r.model] = (byModel[r.model] ?? 0) + (r.total ?? 0)
      }

      return {
        period_days: d,
        total_tokens: total,
        avg_daily: Math.round(total / d),
        by_purpose: byPurpose,
        by_model: byModel,
        by_day: dailyRows.map((r) => ({ date: r.date, tokens: r.tokens ?? 0 })),
      }
    })

    const getRemainingBudget = Effect.fn("TokenTracker.getRemainingBudget")(function* () {
      const budget = yield* getDailyBudget()
      return budget.remaining
    })

    const canAfford = Effect.fn("TokenTracker.canAfford")(function* (estimatedTokens: number) {
      const remaining = yield* getRemainingBudget()
      return remaining >= estimatedTokens
    })

    return Service.of({
      recordUsage,
      getDailyBudget,
      allocateTokens,
      getTaskUsage,
      getUsageStats,
      getRemainingBudget,
      canAfford,
    })
  }),
)

export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(Config.defaultLayer)))

export * as TokenTracker from "./tracker"
