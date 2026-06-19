import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

export function init(path: string) {
  const sqlite = new Database(path, { create: true })
  // WAL mode: allows one writer + multiple readers concurrently
  sqlite.exec("PRAGMA journal_mode = WAL;")
  sqlite.exec("PRAGMA busy_timeout = 5000;")
  sqlite.exec("PRAGMA synchronous = NORMAL;")
  const db = drizzle({ client: sqlite })
  return db
}
