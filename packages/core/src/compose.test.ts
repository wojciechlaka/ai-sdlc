import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRefinementEngine, resolveCorePaths } from './compose'

const CORE_DIR = path.resolve(__dirname, '..')

describe('resolveCorePaths', () => {
  it('points to the shipped migrations and skill file', () => {
    const paths = resolveCorePaths(CORE_DIR)
    expect(fs.existsSync(path.join(paths.migrationsFolder, 'meta', '_journal.json'))).toBe(true)
    expect(fs.existsSync(paths.skillPath)).toBe(true)
  })
})

describe('createRefinementEngine', () => {
  it('creates the database file, migrates and serves use cases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    const dbPath = path.join(dir, 'nested', 'refinement.db')
    const engine = createRefinementEngine({ dbPath, ...resolveCorePaths(CORE_DIR) })

    engine.startup()

    expect(fs.existsSync(dbPath)).toBe(true)
    expect(engine.listTickets()).toHaveLength(3)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
