import { sqliteTable, text, blob } from "drizzle-orm/sqlite-core"
import { MemoryFtsTable } from "./fts.sql"

export const MemoryVecTable = sqliteTable("memory_vec", {
  memory_path: text("memory_path").notNull().unique().references(() => MemoryFtsTable.path),
  embedding: blob("embedding").notNull(),
  embedded_at: text("embedded_at").notNull(),
})
