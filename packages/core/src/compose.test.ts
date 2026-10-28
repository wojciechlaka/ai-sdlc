import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRefinementEngine, resolveCorePaths } from './compose'

const CORE_DIR = path.resolve(__dirname, '..')
const ROOT_DIR = path.resolve(CORE_DIR, '..', '..')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveCorePaths', () => {
  it('points to the shipped migrations and skills', () => {
    const paths = resolveCorePaths(CORE_DIR)
    expect(fs.existsSync(path.join(paths.migrationsFolder, 'meta', '_journal.json'))).toBe(true)
    expect(fs.existsSync(path.join(paths.skillsDir, 'intent-agent.md'))).toBe(true)
  })
})

describe('createRefinementEngine', () => {
  it('creates the database, imports the example tickets and runs without token', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    const engine = createRefinementEngine({
      dbPath: path.join(dir, 'nested', 'refinement.db'),
      ...resolveCorePaths(CORE_DIR),
      ticketsDir: path.join(ROOT_DIR, 'examples', 'tickets'),
      rootDir: ROOT_DIR,
      targetRepo: 'https://github.com/o/r',
    })

    await engine.startup()

    expect(engine.listTickets().map((t) => t.key)).toEqual(['CB-1', 'CB-2', 'CB-3'])
    expect(engine.getSettings()).toEqual({ repoUrl: 'https://github.com/o/r', tokenConfigured: false })
    expect(() => engine.startStage('CB-1', { model: 'm' })).toThrow('GITHUB_TOKEN')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an invalid TARGET_REPO even without token', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    expect(() =>
      createRefinementEngine({
        dbPath: path.join(dir, 'refinement.db'),
        ...resolveCorePaths(CORE_DIR),
        ticketsDir: path.join(ROOT_DIR, 'examples', 'tickets'),
        rootDir: ROOT_DIR,
        targetRepo: 'not-a-url',
      }),
    ).toThrow('TARGET_REPO')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
