import { type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
export * from "drizzle-orm"
import { LocalContext } from "../util"
import { lazy } from "../util/lazy"
import { Global } from "../global"
import { Log } from "../util"
import { NamedError } from "@mimo-ai/shared/util/error"
import z from "zod"
import path from "path"
import { readFileSync, readdirSync, existsSync } from "fs"
import { Flag } from "../flag/flag"
import { InstallationChannel } from "../installation/version"
import { InstanceState } from "@/effect"
import { iife } from "@/util/iife"
import { init } from "#db"

declare const OPENCODE_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

const log = Log.create({ service: "db" })

export function getChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.MIMOCODE_DISABLE_CHANNEL_DB)
    return path.join(Global.Path.data, "mimocode.db")
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")
  return path.join(Global.Path.data, `mimocode-${safe}.db`)
}

export const Path = iife(() => {
  if (Flag.MIMOCODE_DB) {
    if (Flag.MIMOCODE_DB === ":memory:" || path.isAbsolute(Flag.MIMOCODE_DB)) return Flag.MIMOCODE_DB
    return path.join(Global.Path.data, Flag.MIMOCODE_DB)
  }
  return getChannelPath()
})

export type Transaction = SQLiteTransaction<"sync", void>

type Client = SQLiteBunDatabase

type Journal = { sql: string; timestamp: number; name: string }[]

function time(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function migrations(dir: string): Journal {
  const dirs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const sql = dirs
    .map((name) => {
      const file = path.join(dir, name, "migration.sql")
      if (!existsSync(file)) return
      let content = readFileSync(file, "utf-8")
      // Make CREATE TABLE/INDEX/VIRTUAL TABLE/TRIGGER idempotent to handle squashed
      // migrations that conflict with objects created by earlier migration runs.
      // SQLite doesn't support IF NOT EXISTS for VIRTUAL TABLE or TRIGGER natively,
      // but the error tolerance in migrateWithTolerance handles the "already exists" case.
      content = content.replace(/\bCREATE TABLE\b(?! IF NOT EXISTS)/g, "CREATE TABLE IF NOT EXISTS")
      content = content.replace(/\bCREATE\s+VIRTUAL\s+TABLE\b(?! IF NOT EXISTS)/gi, "CREATE VIRTUAL TABLE IF NOT EXISTS")
      content = content.replace(/\bCREATE UNIQUE INDEX\b(?! IF NOT EXISTS)/g, "CREATE UNIQUE INDEX IF NOT EXISTS")
      content = content.replace(/\bCREATE INDEX\b(?! IF NOT EXISTS)/g, "CREATE INDEX IF NOT EXISTS")
      content = content.replace(/\bCREATE TRIGGER\b(?! IF NOT EXISTS)/g, "CREATE TRIGGER IF NOT EXISTS")
      return {
        sql: content,
        timestamp: time(name),
        name,
      }
    })
    .filter(Boolean) as Journal

  return sql.sort((a, b) => a.timestamp - b.timestamp)
}

/** Apply migrations with per-statement error tolerance for ALTER TABLE conflicts */
function migrateWithTolerance(db: Client, entries: Journal) {
  for (const entry of entries) {
    const statements = entry.sql
      .split(/;(?=\s*(?:-->|$))/)
      .map((s) => s.replace(/-->\s*statement-breakpoint/g, "").trim())
      .filter((s) => s.length > 0 && s !== "select 1")

    for (const stmt of statements) {
      try {
        db.run(stmt + ";")

        // CREATE TABLE IF NOT EXISTS is a no-op when the table already exists.
        // New columns defined in the statement won't be added. Detect this and
        // backfill missing columns via ALTER TABLE ADD COLUMN.
        const createMatch = stmt.match(
          /CREATE TABLE IF NOT EXISTS [`"]?(\w+)[`"]?\s*\(([\s\S]+)\)\s*;?\s*$/i,
        )
        if (createMatch) {
          const tableName = createMatch[1]
          const body = createMatch[2]
          // Parse column names from the CREATE TABLE body
          const columns = body
            .split(",")
            .map((line) => {
              const trimmed = line.trim()
              // Skip constraints (PRIMARY KEY, CONSTRAINT, FOREIGN KEY)
              if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(trimmed)) return null
              const colMatch = trimmed.match(/^[`"]?(\w+)[`"]?\s/)
              return colMatch ? colMatch[1] : null
            })
            .filter(Boolean) as string[]

          // Get existing columns
          let existingCols: Set<string>
          try {
            const rows = db.all(`PRAGMA table_info(${tableName})`) as any[]
            existingCols = new Set(rows.map((r: any) => r.name))
          } catch {
            continue
          }

          // Add missing columns
          for (const col of columns) {
            if (existingCols.has(col)) continue
            // Try ALTER TABLE ADD COLUMN — if the column type is parseable from the body
            // Use a simple approach: find the line containing this column name
            const lines = body.split(",")
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.includes(col)) continue
              // Extract everything after the column name (type + constraints)
              // Skip past the column name and any closing backtick/quote
              let afterName = trimmed.slice(trimmed.indexOf(col) + col.length)
              afterName = afterName.replace(/^[`"]?\s+/, "").trim()
              // Remove trailing comma
              const colType = afterName.replace(/,\s*$/, "").trim()
              if (!colType || colType.length > 100) break
              try {
                db.run(`ALTER TABLE ${tableName} ADD COLUMN \`${col}\` ${colType}`)
                log.info("backfilled missing column", { table: tableName, column: col, migration: entry.name })
              } catch (alterErr: any) {
                log.info("backfill column skipped", {
                  table: tableName,
                  column: col,
                  error: (alterErr?.message ?? alterErr?.cause?.message ?? "").slice(0, 80),
                })
              }
              break
            }
          }
        }
      } catch (err: any) {
        const msg = (err?.message ?? "") + " " + (err?.cause?.message ?? "")
        // Determine statement category for tolerance decisions
        const isCreateIdempotent =
          /^CREATE\s+(TABLE|INDEX|VIRTUAL\s+TABLE|TRIGGER)\s+IF\s+NOT\s+EXISTS/i.test(stmt)
        const isDrop =
          /^DROP\s+(TABLE|INDEX|TRIGGER)/i.test(stmt)
        const isAlter = /^ALTER\s+TABLE/i.test(stmt)

        // Idempotent CREATE statements and all DROP statements:
        // CREATE IF NOT EXISTS is safe (table already exists → no-op).
        // DROP (any) is safe because the table either doesn't exist yet,
        // or is FK-protected but already populated — both are "already applied".
        if (isCreateIdempotent || isDrop) {
          log.info("migration statement skipped (already applied)", {
            migration: entry.name,
            error: msg.slice(0, 80),
          })
          continue
        }

        // ALTER TABLE statements: need precise matching since they're not idempotent.
        // Only tolerate known "already applied" patterns.
        if (
          isAlter &&
          (msg.includes("already exists") ||
            msg.includes("duplicate column") ||
            msg.includes("no such table") ||
            msg.includes("no such column") ||
            msg.includes("constraint failed") ||
            (msg.includes("Failed to run the query") && msg.includes("RENAME TO")))
        ) {
          log.info("migration statement skipped (already applied)", {
            migration: entry.name,
            error: msg.slice(0, 80),
          })
          continue
        }

        // Any other failure: re-throw as fatal.
        throw err
      }
    }

    // Record migration as applied
    try {
      db.run(
        `INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES ('${entry.name}', ${entry.timestamp}, '${entry.name}', datetime('now'))`,
      )
    } catch {
      // ignore if journal table doesn't exist yet
    }
  }
}

export const Client = lazy(() => {
  log.info("opening database", { path: Path })

  const db = init(Path)

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA cache_size = -64000")
  db.run("PRAGMA foreign_keys = ON")
  db.run("PRAGMA wal_checkpoint(PASSIVE)")

  // Apply schema migrations
  const entries =
    typeof OPENCODE_MIGRATIONS !== "undefined"
      ? OPENCODE_MIGRATIONS
      : migrations(path.join(import.meta.dirname, "../../migration"))
  if (entries.length > 0) {
    log.info("applying migrations", {
      count: entries.length,
      mode: typeof OPENCODE_MIGRATIONS !== "undefined" ? "bundled" : "dev",
    })
    if (Flag.MIMOCODE_SKIP_MIGRATIONS) {
      for (const item of entries) {
        item.sql = "select 1;"
      }
    }

    // Retry up to 3 times to handle concurrent instance startup races.
    // WAL + busy_timeout(5000) handles most cases, but rare edge cases
    // (e.g. another process mid-WAL-checkpoint) benefit from a retry.
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (typeof OPENCODE_MIGRATIONS !== "undefined") {
          migrate(db, entries)
        } else {
          migrateWithTolerance(db, entries)
        }
        break
      } catch (err: any) {
        const msg = (err?.message ?? "") + " " + (err?.cause?.message ?? "")
        if (attempt < maxRetries - 1 && (msg.includes("database is locked") || msg.includes("SQLITE_BUSY"))) {
          log.warn("migration locked, retrying", { attempt: attempt + 1, delay: 500 * (attempt + 1) })
          Bun.sleepSync(500 * (attempt + 1))
          continue
        }
        throw err
      }
    }
  }

  return db
})

export function close() {
  Client().$client.close()
  Client.reset()
}

export type TxOrDb = Transaction | Client

const ctx = LocalContext.create<{
  tx: TxOrDb
  effects: (() => void | Promise<void>)[]
}>("database")

export function use<T>(callback: (trx: TxOrDb) => T): T {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
      for (const effect of effects) effect()
      return result
    }
    throw err
  }
}

export function effect(fn: () => any | Promise<any>) {
  const bound = InstanceState.bind(fn)
  try {
    ctx.use().effects.push(bound)
  } catch {
    bound()
  }
}

type NotPromise<T> = T extends Promise<any> ? never : T

export function transaction<T>(
  callback: (tx: TxOrDb) => NotPromise<T>,
  options?: {
    behavior?: "deferred" | "immediate" | "exclusive"
  },
): NotPromise<T> {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const txCallback = InstanceState.bind((tx: TxOrDb) => ctx.provide({ tx, effects }, () => callback(tx)))
      const result = Client().transaction(txCallback, { behavior: options?.behavior })
      for (const effect of effects) effect()
      return result as NotPromise<T>
    }
    throw err
  }
}
