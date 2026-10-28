import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type SqliteDb = BetterSQLite3Database<typeof schema>

const IN_MEMORY = ':memory:'

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
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsFolder })
  return db
}
