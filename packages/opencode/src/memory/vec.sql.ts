import { sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * 向量索引表，通过 memory_id 关联 memory_fts.path。
 * embedding 通过 sqlite-vec 的 vec0 虚拟表存储，不在此 Drizzle schema 中。
 * 这里只存关联字段。
 */
export const MemoryVecTable = sqliteTable("memory_vec", {
  memory_path: text("memory_path").notNull().unique().references(() => "memory_fts.path"),
  embedded_at: text("embedded_at").notNull(), // ISO timestamp
})

/** vec0 虚拟表的创建 SQL — 运行时手动执行 */
export const VEC0_CREATE_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(
    embedding float[768]
  )
`

/** 为已有 FTS 行生成向量 */
export const VEC0_INSERT_SQL = `
  INSERT INTO memory_vec_index(rowid, embedding)
  SELECT memory_fts.rowid, ? 
  FROM memory_fts WHERE memory_fts.path = ?
`
