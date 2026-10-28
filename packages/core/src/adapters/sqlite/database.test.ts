import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { createSqliteDatabase } from './database'
import { tickets } from './schema'

const MIGRATIONS = path.resolve(__dirname, '../../../drizzle')

function tempDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-')), 'test.db')
}

function tableNames(file: string): string[] {
  const db = new Database(file)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]
  db.close()
  return rows.map((r) => r.name)
}

describe('createSqliteDatabase', () => {
  it('creates the playbook schema', () => {
    const file = tempDbFile()
    createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS }).$client.close()
    expect(tableNames(file)).toEqual(['__drizzle_migrations', 'agent_runs', 'artifacts', 'audit_events', 'tickets'])
  })

  it('rebuilds a database from before the playbook model', () => {
    const file = tempDbFile()
    const old = new Database(file)
    old.exec(`
      CREATE TABLE tickets (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE review_decisions (id TEXT);
      CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC);
      INSERT INTO tickets (title) VALUES ('alt');
    `)
    old.close()

    const db = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })

    expect(db.select().from(tickets).all()).toEqual([])
    db.$client.close()
    expect(tableNames(file)).not.toContain('review_decisions')
  })

  it('keeps the data of a current database', () => {
    const file = tempDbFile()
    const first = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })
    first.insert(tickets).values({ key: 'CB-1', title: 'T', sourcePath: 'x.md' }).run()
    first.$client.close()

    const second = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })
    expect(second.select().from(tickets).all().map((t) => t.key)).toEqual(['CB-1'])
  })
})
