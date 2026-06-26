import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const InputHistoryTable = sqliteTable("input_history", {
  id: integer().primaryKey({ autoIncrement: true }),
  input: text().notNull(),
  mode: text().$type<"normal" | "shell">(),
  parts: text({ mode: "json" }).notNull().$type<unknown[]>(),
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
})
