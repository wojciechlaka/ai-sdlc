import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { decide, toolTarget } from './guardPolicy.mjs'

// Repository fixture (created at load time, the tables below use its paths): the confinement checks resolve
// real paths, symlinks included.
const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-policy-')))
const repo = path.join(base, 'repo')
const outside = path.join(base, 'outside')
{
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(repo, 'src', 'app.ts'), '')
  fs.writeFileSync(path.join(outside, 'secret.txt'), '')
  fs.symlinkSync(outside, path.join(repo, 'escape'))
}

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

const bash = (command: string) => decide({ tool_name: 'Bash', tool_input: { command }, cwd: repo })

describe('decide — Bash: nur lesende git-Befehle ohne Sonderzeichen', () => {
  it.each([
    'git log',
    'git log --oneline -n20',
    'git log --oneline -20',
    'git log --oneline -- src/app.ts',
    'git log --stat --since=2.weeks --author=alice',
    'git log --follow -- src/app.ts',
    'git --no-pager log -5',
    'git show --stat HEAD',
    'git show HEAD:package.json',
    'git show 3f2a9c1',
    'git diff --stat HEAD',
    'git diff --name-status main -- src',
    'git diff --no-ext-diff --stat',
    'git blame -L10,40 src/app.ts',
    'git blame src/app.ts',
    'git ls-files',
    'git ls-files -- src',
    'git status',
    'git status --short',
    'git status --porcelain',
    'git rev-parse HEAD',
    'git rev-parse --short HEAD',
    'git rev-parse --abbrev-ref HEAD',
  ])('erlaubt %s', (command) => {
    expect(bash(command)).toEqual({ allow: true })
  })

  it.each([
    // Nicht git oder nicht lesend — zum Lesen gibt es Read, Glob, Grep.
    'ls', 'ls -la src', 'cat package.json', 'head -n 50 src/app.ts', 'grep -rn router src', 'rg foo src',
    'find . -name x', 'tree', 'pwd', 'wc -l src/app.ts', 'echo hi', 'cd src', 'jq .scripts package.json',
    'rm -rf docs', 'rm -rf .', 'xargs rm', 'FOO=1 git log',
    'curl https://example.com', 'wget https://example.com', 'ssh host', 'nc host 80',
    'npm install', 'npx tsc', 'node -e 1', 'python3 x.py', 'sh -c ls', 'bash script.sh', 'eval ls',
    // Nicht lesende git-Befehle und Optionen außerhalb der Positivliste.
    'git push', 'git commit -m x', 'git checkout -b x', 'git branch', 'git branch -a', 'git branch -D main',
    'git branch --set-upstream-to=origin/main', 'git grep -n prisma', 'git cat-file -p HEAD',
    'git -c core.pager=sh log', 'git -C /etc log', 'git log -p', 'git log --output=x', 'git diff --output=x.patch',
    'git diff --ext-diff', 'git show --textconv HEAD', 'git log --format=x', 'git status -uall', 'git ls-files -o',
    'git rev-parse --git-dir', 'git log --oneline --pretty',
    // Verkettung, Umleitung, Ersetzung — kein Sonderzeichen ist erlaubt, auch nicht in Anführungszeichen.
    'ls; rm -rf .', 'git log; rm -rf .', 'git log && rm x', 'git log || rm x', 'git log | head', 'git log --oneline | head',
    'git log > out', 'git log >> out', 'git log 2>/dev/null', 'git log & ', 'cat a | tee b',
    'git log $(whoami)', 'git log `whoami`', 'git show <(ls)', 'git log < /dev/tcp/evil/80',
    'git log "a;b"', "git log 'x'", 'git log \\; rm', 'git log *', 'git log ?', 'git log [ab]', 'git log !1',
    'git log {a,b}', 'git show ~/.ssh/id_rsa', 'git log $GITHUB_TOKEN', 'ls $GITHUB_TOKEN',
    'git log\nrm -rf .', 'git log\trm', 'git log\rx',
    // Bypässe aus dem Security-Review.
    'git grep -O"touch /x;"', 'find . {-exec,touch} /x \\;', "find . $'-\\x65xec' touch /x \\;",
    'sort -o/x a', 'sort --out=/x a', 'uniq - /x', 'sed s/a/b/gw /x', "sed -e'1w /x'", 'sed -f x',
    'cat ~/.ssh/id_rsa', 'cat /etc/passwd', 'find . -delete', "sed -i 's/a/b/' x", "awk 'BEGIN{system(\"x\")}'",
    // Pfade außerhalb des Klons, Bereiche und Revisionsausdrücke.
    'git show /etc/passwd', 'git log -- /etc', 'git diff HEAD..main', 'git log -- ../outside', 'git show HEAD^',
    'git show HEAD~1', 'git show HEAD@{1}',
    // Form.
    '', ' ', 'git', 'git  log', 'git log ' + 'a'.repeat(300),
  ])('blockiert %j', (command) => {
    const decision = bash(command)
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toContain('Read, Glob oder Grep')
  })

  it('nennt das gefundene Sonderzeichen', () => {
    expect(bash('git log; rm -rf .')).toEqual({ allow: false, reason: expect.stringContaining('„;“') })
  })
})

describe('decide — Read, Glob, Grep nur innerhalb des Repositorys', () => {
  const call = (tool_name: string, tool_input: Record<string, unknown>, cwd: string | undefined = repo) => decide({ tool_name, tool_input, cwd })

  it('erlaubt Pfade im Repository, auch nicht existierende und relative', () => {
    expect(call('Read', { file_path: path.join(repo, 'src', 'app.ts') })).toEqual({ allow: true })
    expect(call('Read', { file_path: path.join(repo, 'src', 'neu.ts') })).toEqual({ allow: true })
    expect(call('Read', { file_path: 'src/app.ts' })).toEqual({ allow: true })
    expect(call('Glob', { pattern: '**/*.{ts,tsx}' })).toEqual({ allow: true })
    expect(call('Glob', { pattern: '*.ts', path: path.join(repo, 'src') })).toEqual({ allow: true })
    expect(call('Grep', { pattern: 'a..b', path: repo, glob: '*.ts' })).toEqual({ allow: true })
    expect(call('Grep', { pattern: 'router' })).toEqual({ allow: true })
  })

  it.each([
    ['Read', { file_path: '/etc/passwd' }],
    ['Read', { file_path: path.join(outside, 'secret.txt') }],
    ['Read', { file_path: path.join(repo, '..', 'outside', 'secret.txt') }],
    ['Read', { file_path: path.join(repo, 'escape', 'secret.txt') }],
    ['Read', { file_path: '~/.ssh/id_rsa' }],
    ['Read', {}],
    ['Glob', { pattern: '/etc/*' }],
    ['Glob', { pattern: '../**/*' }],
    ['Glob', { pattern: '{/etc/*,x}' }],
    ['Glob', { pattern: '~/*' }],
    ['Glob', { pattern: '*', path: '/' }],
    ['Glob', { pattern: '*', path: path.join(repo, 'escape') }],
    ['Grep', { pattern: 'x', path: '/etc' }],
    ['Grep', { pattern: 'x', glob: '../*' }],
  ])('blockiert %s %j', (tool, input) => {
    expect(call(tool, input)).toEqual({ allow: false, reason: expect.stringContaining('Nur innerhalb des Repositorys lesen') })
  })

  it('blockiert ohne Arbeitsordner', () => {
    expect(decide({ tool_name: 'Read', tool_input: { file_path: 'src/app.ts' } }).allow).toBe(false)
  })
})

describe('decide — übrige Werkzeuge', () => {
  it.each(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite'])('blockiert %s', (tool) => {
    expect(decide({ tool_name: tool, tool_input: {}, cwd: repo })).toEqual({ allow: false, reason: expect.stringContaining(tool) })
  })

  it('blockiert Bash ohne Befehl und unbekannte Eingaben', () => {
    expect(decide({ tool_name: 'Bash', tool_input: {}, cwd: repo }).allow).toBe(false)
    expect(decide({ tool_name: undefined, tool_input: undefined }).allow).toBe(false)
  })
})

describe('toolTarget', () => {
  it('nimmt Befehl, Datei oder Muster und kürzt Pfade relativ zum Arbeitsordner', () => {
    expect(toolTarget({ tool_name: 'Bash', tool_input: { command: 'git log -5' } })).toBe('git log -5')
    expect(toolTarget({ tool_name: 'Read', tool_input: { file_path: '/repo/src/app.ts' }, cwd: '/repo' })).toBe('src/app.ts')
    expect(toolTarget({ tool_name: 'Glob', tool_input: { pattern: '**/*.ts', path: '/repo/src' }, cwd: '/repo' })).toBe('**/*.ts in src')
    expect(toolTarget({ tool_name: 'Grep', tool_input: { pattern: 'router' } })).toBe('router')
    expect(toolTarget({ tool_name: 'Write', tool_input: { file_path: '/elsewhere/x' }, cwd: '/repo' })).toBe('/elsewhere/x')
  })

  it('kürzt auf 200 Zeichen, auf Wunsch auf mehr', () => {
    const call = { tool_name: 'Bash', tool_input: { command: 'x'.repeat(1500) } }
    expect(toolTarget(call)).toHaveLength(200)
    expect(toolTarget(call).endsWith('…')).toBe(true)
    expect(toolTarget(call, 1000)).toHaveLength(1000)
  })
})
