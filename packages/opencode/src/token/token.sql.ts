import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"

export const TokenUsageTable = sqliteTable(
  "token_usage",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    session_id: text().notNull(),
    task_id: text(),
    agent_type: text().notNull().default("build"),
    model_id: text().notNull(),
    provider_id: text().notNull(),
    input_tokens: integer().notNull(),
    output_tokens: integer().notNull(),
    total_tokens: integer().notNull(),
    timestamp: integer().notNull(),
    purpose: text().$type<"planning" | "execution" | "review" | "testing" | "compaction">().notNull().default("execution"),
  },
  (table) => [
    index("token_usage_session_idx").on(table.session_id),
    index("token_usage_task_idx").on(table.task_id),
    index("token_usage_timestamp_idx").on(table.timestamp),
    index("token_usage_purpose_idx").on(table.purpose),
  ],
)

export const DailyBudgetTable = sqliteTable(
  "daily_budget",
  {
    date: text().primaryKey(),
    total_budget: integer().notNull(),
    used: integer().notNull().default(0),
    planning_used: integer().notNull().default(0),
    execution_used: integer().notNull().default(0),
    review_used: integer().notNull().default(0),
    testing_used: integer().notNull().default(0),
    compaction_used: integer().notNull().default(0),
    allocated: text(),
    updated_at: integer().notNull(),
  },
  (table) => [
    index("daily_budget_date_idx").on(table.date),
  ],
)
