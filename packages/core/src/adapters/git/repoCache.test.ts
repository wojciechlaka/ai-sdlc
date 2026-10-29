import { describe, it, expect } from 'vitest'
import { getRepoDir, getCommitHash, ensureRepoSummary } from './repoCache'
import { createAgentSandbox } from '../agentSandbox/agentSandbox'
import { execFileSync } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const OPTIONS = { sandbox: createAgentSandbox({ hooksDir: path.resolve(__dirname, '../../../hooks') }) }

async function makeTempRepo(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'))
  execFileSync('git', ['init'], { cwd: tmp, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmp, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmp, stdio: 'pipe' })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: tmp, stdio: 'pipe' })
  return tmp
}

describe('getRepoDir', () => {
  it('generates consistent cache dir from repo url', () => {
    const url = 'https://github.com/example/repo'
    expect(getRepoDir(url)).toBe(getRepoDir(url))
    expect(getRepoDir(url)).toContain('repo-cache')
  })

  it('generates different dirs for different repos', () => {
    expect(getRepoDir('https://github.com/a/repo'))
      .not.toBe(getRepoDir('https://github.com/b/repo'))
  })
})

describe('getCommitHash', () => {
  it('returns a 40-character hex commit hash', async () => {
    const tmp = await makeTempRepo()
    try {
      expect(getCommitHash(tmp)).toMatch(/^[a-f0-9]{40}$/)
    } finally {
      await fs.rm(tmp, { recursive: true })
    }
  })
})

describe('ensureRepoSummary', () => {
  it('returns cached summary and emits a single cache-hit message', async () => {
    const tmp = await makeTempRepo()
    try {
      const hash = getCommitHash(tmp)
      const model = 'test-model'
      const summaryPath = path.join(tmp, `codebase-summary-${hash}-${model}.md`)
      await fs.writeFile(summaryPath, '## Test\nCached content.')

      const messages: string[] = []
      const result = await ensureRepoSummary(tmp, model, (msg) => messages.push(msg), OPTIONS)

      expect(result).toBe('## Test\nCached content.')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('test-model')
    } finally {
      await fs.rm(tmp, { recursive: true })
    }
  })

  it('returns null when a subprocess fails (git ENOENT with empty PATH)', async () => {
    const tmp = await makeTempRepo()
    const originalPath = process.env.PATH
    try {
      process.env.PATH = ''
      const result = await ensureRepoSummary(tmp, 'test-model', () => {}, OPTIONS)
      expect(result).toBeNull()
    } finally {
      process.env.PATH = originalPath
      await fs.rm(tmp, { recursive: true })
    }
  })
})

describe('createGitRepoProvider', () => {
  it('exposes ensureRepo and ensureRepoSummary as the RepoProvider port', async () => {
    const { createGitRepoProvider } = await import('./repoCache')
    const provider = createGitRepoProvider(OPTIONS)
    expect(typeof provider.ensureRepo).toBe('function')
    expect(typeof provider.ensureSummary).toBe('function')
  })
})
