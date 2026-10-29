import path from 'path'
import { createSqliteDatabase, type SqliteDb } from '../adapters/sqlite/database'

/** Fresh in-memory database with the real migrations applied. */
export function createTestDatabase(): SqliteDb {
  return createSqliteDatabase({
    path: ':memory:',
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
  })
}
