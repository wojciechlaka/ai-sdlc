import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureRepo, getRepoDir } from './repoCache'

// Real git: the clone follows the base branch `showcase` of the remote, also after the app's reset force-moved it
// to another commit (a `git pull` fails there). The default branch `master` is never checked out.

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-base-branch-')))
const source = path.join(base, 'source')
const cacheDir = path.join(base, 'cache')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd, stdio: 'pipe' }).toString().trim()

function commitFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true })
  fs.writeFileSync(path.join(source, file), content)
  git(source, 'add', '.')
  git(source, 'commit', '-qm', file)
}

beforeAll(() => {
  fs.mkdirSync(source)
  git(source, 'init', '-q', '-b', 'master')
  commitFile('README.md', 'base')
  git(source, 'tag', 'showcase-base')
  git(source, 'checkout', '-q', '-b', 'showcase')
  commitFile('docs/work/CB-1/intent.md', '# CB-1: Intent')
  git(source, 'checkout', '-q', 'master')
  commitFile('master-only.md', 'nur auf master')
})

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

describe('ensureRepo — base branch', () => {
  it('checks out the base branch, not the default branch', async () => {
    const dir = await ensureRepo(source, cacheDir, 'showcase')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(source, 'rev-parse', 'showcase'))
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('showcase')
    expect(fs.readFileSync(path.join(dir, 'docs/work/CB-1/intent.md'), 'utf-8')).toBe('# CB-1: Intent')
    expect(fs.existsSync(path.join(dir, 'master-only.md'))).toBe(false)
  })

  it('follows new commits and a force-reset of the base branch between two runs', async () => {
    const dir = await ensureRepo(source, cacheDir, 'showcase')
    fs.writeFileSync(path.join(dir, 'codebase-summary-x.md'), 'bleibt')

    git(source, 'checkout', '-q', 'showcase')
    commitFile('docs/work/CB-1/spec.md', '# CB-1: Spec')
    git(source, 'checkout', '-q', 'master')
    await ensureRepo(source, cacheDir, 'showcase')
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/spec.md'))).toBe(true)

    git(source, 'branch', '-f', 'showcase', 'showcase-base') // the app's reset: force back to the baseline tag
    await ensureRepo(source, cacheDir, 'showcase')

    expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(source, 'rev-parse', 'showcase-base'))
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/intent.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/spec.md'))).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'codebase-summary-x.md'), 'utf-8')).toBe('bleibt')
    expect(git(dir, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })

  it('never touches a parent repository when the cache directory is inside it and the clone folder is broken', async () => {
    // Raw (not realpath'd) temp path: on macOS os.tmpdir() is a symlink, which the ceiling must cope with too.
    const rawBase = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-parent-'))
    const parent = path.join(rawBase, 'parent')
    fs.mkdirSync(parent)
    git(parent, 'init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(parent, 'work.md'), 'wichtig')
    git(parent, 'add', '.')
    git(parent, 'commit', '-qm', 'work')
    git(parent, 'remote', 'add', 'origin', 'https://example.invalid/parent.git')
    const head = git(parent, 'rev-parse', 'HEAD')

    const nestedCache = path.join(parent, 'cache')
    const brokenDir = getRepoDir(source, nestedCache)
    fs.mkdirSync(brokenDir, { recursive: true }) // empty: an interrupted clone

    try {
      const dir = await ensureRepo(source, nestedCache, 'showcase')
      expect(git(dir, 'rev-parse', '--show-toplevel')).toBe(fs.realpathSync(dir))
      expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(source, 'rev-parse', 'showcase'))
      expect(git(parent, 'rev-parse', 'HEAD')).toBe(head)
      expect(git(parent, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
      expect(git(parent, 'remote', 'get-url', 'origin')).toBe('https://example.invalid/parent.git')
      expect(fs.readFileSync(path.join(parent, 'work.md'), 'utf-8')).toBe('wichtig')
    } finally {
      fs.rmSync(rawBase, { recursive: true, force: true })
    }
  })
})
