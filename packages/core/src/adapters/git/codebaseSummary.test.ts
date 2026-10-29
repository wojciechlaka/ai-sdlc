import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, spawn: vi.fn() }
})

import { spawn } from 'child_process'
import { ensureRepoSummary, getCommitHash } from './codebaseSummary'
import { createAgentSandbox } from '../agentSandbox/agentSandbox'

const mockSpawn = vi.mocked(spawn)
const HOOKS_DIR = path.resolve(__dirname, '../../../hooks')
const OPTIONS = { sandbox: createAgentSandbox({ hooksDir: HOOKS_DIR }) }

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-repo-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir })
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('ensureRepoSummary — summary run with guard and audit hooks', () => {
  it('runs claude in the sandbox and reports blocked calls only as server warnings', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_secret')
    const repo = makeTempRepo()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let logFile = ''
    mockSpawn.mockImplementation(((_cmd: string, _args: string[], options: { env: Record<string, string> }) => {
      logFile = options.env.REFINEMENT_HOOK_LOG
      const proc = new EventEmitter() as any
      proc.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() })
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      setTimeout(() => {
        fs.appendFileSync(logFile, JSON.stringify({ kind: 'used', tool: 'Read', target: 'package.json' }) + '\n')
        fs.appendFileSync(logFile, JSON.stringify({ kind: 'blocked', tool: 'Bash', target: 'npm install', reason: 'npm: nicht erlaubt' }) + '\n')
        proc.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', result: '## Stack' }) + '\n'))
        proc.emit('close', 0)
      }, 5)
      return proc
    }) as never)

    try {
      const summary = await ensureRepoSummary(repo, 'test-model', () => {}, OPTIONS)

      expect(summary).toBe('## Stack')
      const args = mockSpawn.mock.calls[0]![1] as string[]
      expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Glob,Grep,Bash')
      expect(args[args.indexOf('--setting-sources') + 1]).toBe('user')
      const env = (mockSpawn.mock.calls[0]![2] as { env: Record<string, string> }).env
      expect(env).not.toHaveProperty('GITHUB_TOKEN')
      expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null')
      const settings = JSON.parse(args[args.indexOf('--settings') + 1]!)
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain(path.join(HOOKS_DIR, 'guard.mjs'))
      expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain(path.join(HOOKS_DIR, 'audit.mjs'))
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith('[codebaseSummary] Blocked: Bash npm install — npm: nicht erlaubt')
      expect(fs.existsSync(logFile)).toBe(false)
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('ensureRepoSummary', () => {
  it('returns cached summary and emits a single cache-hit message', async () => {
    const tmp = makeTempRepo()
    try {
      const hash = getCommitHash(tmp)
      const model = 'test-model'
      const summaryPath = path.join(tmp, `codebase-summary-${hash}-${model}.md`)
      fs.writeFileSync(summaryPath, '## Test\nCached content.')

      const messages: string[] = []
      const result = await ensureRepoSummary(tmp, model, (msg) => messages.push(msg), OPTIONS)

      expect(result).toBe('## Test\nCached content.')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('test-model')
    } finally {
      fs.rmSync(tmp, { recursive: true })
    }
  })

  it('returns null when a subprocess fails (git ENOENT with empty PATH)', async () => {
    const tmp = makeTempRepo()
    const originalPath = process.env.PATH
    try {
      process.env.PATH = ''
      const result = await ensureRepoSummary(tmp, 'test-model', () => {}, OPTIONS)
      expect(result).toBeNull()
    } finally {
      process.env.PATH = originalPath
      fs.rmSync(tmp, { recursive: true })
    }
  })
})
