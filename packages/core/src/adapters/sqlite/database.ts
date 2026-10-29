import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

/** Drizzle database on better-sqlite3 with the app schema; `$client` gives the raw connection. */
export type SqliteDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

const IN_MEMORY = ':memory:'

/** Tables of the schema before the playbook model; `review_decisions` exists only there. */
const LEGACY_TABLES = ['review_decisions', 'audit_events', 'agent_runs', 'tickets', '__drizzle_migrations']

/**
 * The playbook model replaced the whole schema and no data is carried over (spec §4):
 * an old database is emptied so the migrations build it from scratch. better-sqlite3 enables
 * foreign keys by default, so they are switched off explicitly and the drops run atomically.
 */
function dropLegacySchema(sqlite: Database.Database): void {
  const legacy = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'review_decisions'").get()
  if (!legacy) return
  sqlite.pragma('foreign_keys = OFF')
  sqlite.transaction(() => {
    for (const table of LEGACY_TABLES) sqlite.exec(`DROP TABLE IF EXISTS "${table}"`)
  })()
  console.warn('[db] Database in the old schema found — rebuilt')
}

/**
 * Opens (or creates) the SQLite database, enables foreign keys and applies all migrations.
 * @param options.path             - File path, or `:memory:` for tests.
 * @param options.migrationsFolder - Absolute path to `packages/core/drizzle`.
 * @throws If a migration fails — the app must not start on a broken schema.
 */
export function createSqliteDatabase(options: { path: string; migrationsFolder: string }): SqliteDb {
  if (options.path !== IN_MEMORY) {
    fs.mkdirSync(path.dirname(options.path), { recursive: true })
  }
  const sqlite = new Database(options.path)
  dropLegacySchema(sqlite)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsFolder })
  return db
}
