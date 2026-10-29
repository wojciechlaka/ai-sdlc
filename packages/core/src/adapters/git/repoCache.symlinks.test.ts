import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureRepo, getRepoDir } from './repoCache'

// Real git: symlinks of the target repo must end up as plain files in the cache (spec §13), for a fresh clone
// and for a cache cloned earlier with symlinks.

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-symlinks-')))
const source = path.join(base, 'source')
const cacheDir = path.join(base, 'cache')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd, stdio: 'pipe' })

beforeAll(() => {
  fs.mkdirSync(source)
  git(source, 'init', '-q')
  fs.writeFileSync(path.join(source, 'a.txt'), 'a')
  fs.symlinkSync('/etc/passwd', path.join(source, 'link'))
  git(source, 'add', '.')
  git(source, 'commit', '-qm', 'init')
})

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

const isSymlink = (file: string) => fs.lstatSync(file).isSymbolicLink()

describe('ensureRepo — symlinks as files', () => {
  it('checks symlinks out as plain files when cloning', async () => {
    const dir = await ensureRepo(source, cacheDir)
    expect(isSymlink(path.join(dir, 'link'))).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'link'), 'utf-8')).toBe('/etc/passwd')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('turns symlinks of an older cache into files when updating', async () => {
    const dir = getRepoDir(source, cacheDir)
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    execFileSync('git', ['clone', '-q', source, dir], { stdio: 'pipe' }) // old cache, with symlinks
    expect(isSymlink(path.join(dir, 'link'))).toBe(true)
    fs.writeFileSync(path.join(dir, 'codebase-summary-x.md'), 'bleibt')
    fs.symlinkSync('/etc', path.join(source, 'link2'))
    git(source, 'add', '.')
    git(source, 'commit', '-qm', 'second link')

    await ensureRepo(source, cacheDir)

    expect(isSymlink(path.join(dir, 'link'))).toBe(false)
    expect(isSymlink(path.join(dir, 'link2'))).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'codebase-summary-x.md'), 'utf-8')).toBe('bleibt')
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: dir }).toString()).toBe('')
  })
})
