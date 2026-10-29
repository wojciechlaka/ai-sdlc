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
  ['fetch', '-q', 'origin', 'showcase'],
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
