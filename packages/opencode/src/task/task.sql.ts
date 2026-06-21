import { sqliteTable, text, integer, real, index, primaryKey, foreignKey } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import type { SessionID } from "../session/schema"

export const TaskTable = sqliteTable(
  "task",
  {
    id: text().notNull(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    parent_task_id: text(),
    status: text().$type<"open" | "in_progress" | "blocked" | "done" | "abandoned">().notNull(),
    summary: text().notNull(),
    owner: text(),
    created_at: integer().notNull(),
    last_event_at: integer().notNull(),
    ended_at: integer(),
    cleanup_after: integer(),
    priority: text().$type<"critical" | "high" | "medium" | "low">().notNull().default("medium"),
    complexity: text().$type<"simple" | "moderate" | "complex" | "epic">().notNull().default("moderate"),
    estimated_tokens: integer(),
    actual_tokens: integer(),
    goal_alignment: real(),
    tags: text(),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.id] }),
    index("task_session_idx").on(table.session_id),
    index("task_parent_idx").on(table.session_id, table.parent_task_id),
    index("task_status_idx").on(table.status),
    index("task_priority_idx").on(table.priority),
  ],
)

export const TaskEventTable = sqliteTable(
  "task_event",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    task_id: text().notNull(),
    at: integer().notNull(),
    kind: text().notNull(),
    summary: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.session_id, table.task_id],
      foreignColumns: [TaskTable.session_id, TaskTable.id],
    }).onDelete("cascade"),
    index("task_event_task_idx").on(table.session_id, table.task_id, table.at),
  ],
)
