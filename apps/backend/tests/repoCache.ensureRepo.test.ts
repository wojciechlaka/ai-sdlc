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

import { ensureRepo } from '../src/repoCache'

const REPO_URL = 'https://github.com/test/repo'

describe('ensureRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFileSync.mockReturnValue(Buffer.from(''))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('clones the repo when the cache directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    await ensureRepo(REPO_URL)
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['clone', REPO_URL, expect.stringContaining('repo-cache')],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('pulls when the cache directory already exists', async () => {
    mockExistsSync.mockReturnValue(true)
    await ensureRepo(REPO_URL)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['pull'],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('removes the broken directory and re-clones when git pull fails', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExecFileSync
      .mockImplementationOnce(() => { throw new Error('not a git repository') })
      .mockReturnValueOnce(Buffer.from(''))
    await ensureRepo(REPO_URL)
    expect(mockRmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      'git',
      ['clone', REPO_URL, expect.stringContaining('repo-cache')],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('injects GITHUB_TOKEN into the clone URL when the env var is set', async () => {
    mockExistsSync.mockReturnValue(false)
    vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
    await ensureRepo(REPO_URL)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['clone', 'https://mytoken123@github.com/test/repo', expect.stringContaining('repo-cache')],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })
})
