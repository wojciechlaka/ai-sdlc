import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { createSqliteDatabase } from './database'
import { tickets } from './schema'

const MIGRATIONS = path.resolve(__dirname, '../../../drizzle')

const tempDirs: string[] = []
const opened: { close(): void; open: boolean }[] = []

function tempDbFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-'))
  tempDirs.push(dir)
  return path.join(dir, 'test.db')
}

function openDb(file: string) {
  const db = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })
  opened.push(db.$client)
  return db
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const c of opened.splice(0)) if (c.open) c.close()
  for (const d of tempDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function tableNames(file: string): string[] {
  const db = new Database(file)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]
  db.close()
  return rows.map((r) => r.name)
}

describe('createSqliteDatabase', () => {
  it('creates the playbook schema', () => {
    const file = tempDbFile()
    openDb(file)
    expect(tableNames(file)).toEqual(['__drizzle_migrations', 'agent_runs', 'artifacts', 'audit_events', 'tickets'])
  })

  it('rebuilds a database from before the playbook model', () => {
    const file = tempDbFile()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const old = new Database(file)
    old.pragma('foreign_keys = ON')
    old.exec(`
      CREATE TABLE tickets (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE agent_runs (id TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id));
      CREATE TABLE review_decisions (id TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id));
      CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC);
      INSERT INTO tickets (title) VALUES ('alt');
      INSERT INTO agent_runs (id, ticket_id) VALUES ('r1', 1);
      INSERT INTO review_decisions (id, ticket_id) VALUES ('d1', 1);
    `)
    old.close()

    const db = openDb(file)

    expect(db.select().from(tickets).all()).toEqual([])
    expect(warn).toHaveBeenCalled()
    db.$client.close()
    expect(tableNames(file)).not.toContain('review_decisions')
  })

  it('keeps the data of a current database', () => {
    const file = tempDbFile()
    const first = openDb(file)
    first.insert(tickets).values({ key: 'CB-1', title: 'T', sourcePath: 'x.md' }).run()
    first.$client.close()

    const second = openDb(file)
    expect(second.select().from(tickets).all().map((t) => t.key)).toEqual(['CB-1'])
  })
})
