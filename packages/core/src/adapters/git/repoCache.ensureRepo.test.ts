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
      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
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
      .mockReturnValueOnce(Buffer.from(''))
      .mockReturnValueOnce(Buffer.from(''))
      .mockImplementationOnce(() => { throw new Error('not a git repository') })
      .mockReturnValueOnce(Buffer.from(''))
    await ensureRepo(REPO_URL)
    expect(mockRmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(mockExecFileSync).toHaveBeenCalledTimes(4)
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      'git',
      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('clones with the plain URL even when GITHUB_TOKEN is set', async () => {
    mockExistsSync.mockReturnValue(false)
    vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
    await ensureRepo(REPO_URL)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
      expect.objectContaining({ stdio: 'pipe' }),
    )
  })

  it('resets the remote URL before pulling an existing cache', async () => {
    mockExistsSync.mockReturnValue(true)
    vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
    await ensureRepo(REPO_URL)
    const calls = mockExecFileSync.mock.calls.map((c) => c[1])
    expect(calls).toEqual([
      ['remote', 'set-url', 'origin', REPO_URL],
      ['config', 'core.symlinks', 'false'],
      ['pull'],
      ['rm', '-r', '-q', '--cached', '.'],
      ['reset', '-q', '--hard'],
    ])
    expect(mockExecFileSync.mock.calls[0][2]).toEqual(expect.objectContaining({ cwd: expect.any(String) }))
  })
})
