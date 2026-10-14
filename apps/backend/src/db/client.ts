import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import path from 'path'

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../data/refinement.db')

const sqlite = new Database(DB_PATH)
sqlite.pragma('foreign_keys = ON')
export const db = drizzle(sqlite, { schema })

try {
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') })
} catch (err) {
  console.error('[db] Migration failed:', err)
  throw err
}
