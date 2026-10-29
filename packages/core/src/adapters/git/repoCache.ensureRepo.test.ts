import path from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecFileSync, mockExistsSync, mockMkdirSync, mockRmSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn().mockReturnValue(Buffer.from('')),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockRmSync: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFileSync: mockExecFileSync, spawn: vi.fn() }
})

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: {
      ...(actual as object),
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      rmSync: mockRmSync,
    },
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    rmSync: mockRmSync,
  }
})

import { ensureRepo } from './repoCache'

const REPO_URL = 'https://github.com/test/repo'
const CACHE_DIR = '/tmp/test/repo-cache'
const CLONE = ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')]
const CHECKOUT_SHOWCASE = [
  ['remote', 'set-url', 'origin', REPO_URL],
  ['config', 'core.symlinks', 'false'],
  ['fetch', '-q', 'origin', 'refs/heads/showcase'],
  ['checkout', '-q', '-f', '-B', 'showcase', 'FETCH_HEAD'],
  ['rm', '-r', '-q', '--cached', '.'],
  ['reset', '-q', '--hard'],
]
const gitArgs = () => mockExecFileSync.mock.calls.map((call) => call[1])

describe('ensureRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFileSync.mockReturnValue(Buffer.from(''))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('clones the repo and checks out the base branch when the cache directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    expect(mockMkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true })
    expect(gitArgs()).toEqual([CLONE, ...CHECKOUT_SHOWCASE])
    expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ stdio: 'pipe' }))
  })

  it('fetches the base branch and resets onto it when the cache directory already exists', async () => {
    mockExistsSync.mockReturnValue(true)
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    expect(gitArgs()).toEqual(CHECKOUT_SHOWCASE)
    expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ cwd: expect.any(String), stdio: 'pipe' }))
    expect(gitArgs()).not.toContainEqual(['pull'])
  })

  it('confines every checkout git call to the cache directory via GIT_CEILING_DIRECTORIES', async () => {
    mockExistsSync.mockReturnValue(true)
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    expect(mockExecFileSync.mock.calls.length).toBe(CHECKOUT_SHOWCASE.length)
    for (const call of mockExecFileSync.mock.calls) {
      const options = call[2] as { cwd: string; env: Record<string, string> }
      expect(options.env.GIT_CEILING_DIRECTORIES).toBe(path.dirname(options.cwd))
    }
  })

  it('resolves a relative cache directory so the ceiling and the returned directory are absolute', async () => {
    mockExistsSync.mockReturnValue(true)
    const dir = await ensureRepo(REPO_URL, '.cache/repos', 'showcase')
    expect(path.isAbsolute(dir)).toBe(true)
    for (const call of mockExecFileSync.mock.calls) {
      const options = call[2] as { cwd: string; env: Record<string, string> }
      expect(path.isAbsolute(options.env.GIT_CEILING_DIRECTORIES)).toBe(true)
      expect(options.env.GIT_CEILING_DIRECTORIES).toBe(path.dirname(options.cwd))
    }
  })

  it('does not let inherited GIT_DIR or GIT_WORK_TREE override repository discovery', async () => {
    mockExistsSync.mockReturnValue(true)
    vi.stubEnv('GIT_DIR', '/elsewhere/.git')
    vi.stubEnv('GIT_WORK_TREE', '/elsewhere')
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    for (const call of mockExecFileSync.mock.calls) {
      const env = (call[2] as { env: Record<string, string> }).env
      expect(env).not.toHaveProperty('GIT_DIR')
      expect(env).not.toHaveProperty('GIT_WORK_TREE')
    }
  })

  it('removes the broken directory and re-clones when the update fails', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(''))
      .mockReturnValueOnce(Buffer.from(''))
      .mockImplementationOnce(() => {
        throw new Error('not a git repository')
      })
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    expect(mockRmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
    expect(mockMkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true })
    expect(gitArgs().slice(3)).toEqual([CLONE, ...CHECKOUT_SHOWCASE])
  })

  it('fails when the fresh clone has no base branch', async () => {
    mockExistsSync.mockReturnValue(false)
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'fetch') {
        throw new Error("couldn't find remote ref showcase")
      }
      return Buffer.from('')
    })
    await expect(ensureRepo(REPO_URL, CACHE_DIR, 'showcase')).rejects.toThrow('remote ref showcase')
  })

  it('clones with the plain URL even when GITHUB_TOKEN is set', async () => {
    mockExistsSync.mockReturnValue(false)
    vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
    expect(gitArgs()[0]).toEqual(CLONE)
    expect(JSON.stringify(gitArgs())).not.toContain('mytoken123')
  })
})
