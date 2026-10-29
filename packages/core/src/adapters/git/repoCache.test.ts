import { describe, it, expect } from 'vitest'
import { getRepoDir } from './repoCache'
import { createAgentSandbox } from '../agentSandbox/agentSandbox'
import os from 'os'
import path from 'path'

const CACHE_DIR = path.join(os.tmpdir(), 'repo-cache')
const OPTIONS = { cacheDir: CACHE_DIR, sandbox: createAgentSandbox({ hooksDir: path.resolve(__dirname, '../../../hooks') }) }

describe('getRepoDir', () => {
  it('generates consistent cache dir from repo url', () => {
    const url = 'https://github.com/example/repo'
    expect(getRepoDir(url, CACHE_DIR)).toBe(getRepoDir(url, CACHE_DIR))
    expect(getRepoDir(url, CACHE_DIR)).toMatch(new RegExp(`^${CACHE_DIR}/[0-9a-f]{12}$`))
  })

  it('generates different dirs for different repos', () => {
    expect(getRepoDir('https://github.com/a/repo', CACHE_DIR))
      .not.toBe(getRepoDir('https://github.com/b/repo', CACHE_DIR))
  })
})

describe('createGitRepoProvider', () => {
  it('exposes ensureRepo and ensureSummary as the RepoProvider port', async () => {
    const { createGitRepoProvider } = await import('./repoCache')
    const provider = createGitRepoProvider(OPTIONS)
    expect(typeof provider.ensureRepo).toBe('function')
    expect(typeof provider.ensureSummary).toBe('function')
  })
})
