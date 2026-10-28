import { describe, it, expect } from 'vitest'
import { decide, toolTarget } from './guardPolicy.mjs'

const bash = (command: string) => decide({ tool_name: 'Bash', tool_input: { command } })

describe('decide — Bash (Positivliste)', () => {
  it.each([
    'ls',
    'ls -la src',
    'cat package.json',
    'head -n 50 src/app.ts',
    'tail -20 README.md',
    'wc -l src/*.ts',
    'grep -rn "router" src',
    'rg foo src',
    'find . -name "*.ts" -not -path "./node_modules/*"',
    'tree -L 2',
    'pwd',
    'file src/app.ts',
    'stat package.json',
    'du -sh src',
    'cat a.txt | sort | uniq -c',
    'cut -d: -f1 /etc/passwd',
    "awk '{print $1}' file.txt",
    "sed -n '1,20p' src/app.ts",
    'jq .scripts package.json',
    'git log --oneline | head',
    'git log -5',
    'git show HEAD:package.json',
    'git diff HEAD~1 --stat',
    'git status',
    'git ls-files src',
    'git blame src/app.ts',
    'git grep -n prisma',
    'git branch -a',
    'git branch --contains HEAD',
    'git rev-parse HEAD',
    'git cat-file -p HEAD',
    'git --no-pager log -3',
    'ls src && cat package.json',
    'ls src || ls',
    'ls; pwd',
    'grep "a > b" notes.md',
    "grep 'x|y' src/app.ts",
    'cat < package.json',
  ])('erlaubt %s', (command) => {
    expect(bash(command)).toEqual({ allow: true })
  })

  it.each([
    ['rm -rf docs', 'rm'],
    ['ls; rm -rf .', 'rm'],
    ['ls && rm x', 'rm'],
    ['cat a > b', 'Ausgabeumleitung'],
    ['cat a >> b', 'Ausgabeumleitung'],
    ['cat a | tee b', 'tee'],
    ['grep foo x 2>/dev/null', 'Ausgabeumleitung'],
    ['git push', 'git push'],
    ['git commit -m x', 'git commit'],
    ['git checkout -b x', 'git checkout'],
    ['git -c core.pager=sh log', 'git'],
    ['git branch -D main', 'git branch'],
    ['git branch neu', 'git branch'],
    ['git diff --output=x.patch', '--output'],
    ['find . -delete', '-delete'],
    ['find . -name "*.ts" -exec rm {} \\;', '-exec'],
    ['find . -ok cat {} ;', '-ok'],
    ['grep x $(whoami)', 'Befehlsersetzung'],
    ['grep x `whoami`', 'Befehlsersetzung'],
    ['cat <(ls)', 'Prozessersetzung'],
    ["sed -i 's/a/b/' src/app.ts", 'sed -i'],
    ["sed -i.bak 's/a/b/' x", 'sed -i'],
    ["sed --in-place 's/a/b/' x", 'sed -i'],
    ["sed 's/a/b/w out.txt' x", 'sed'],
    ["awk 'BEGIN { system(\"rm -rf .\") }'", 'awk'],
    ["awk '{ print > \"out\" }' x", 'awk'],
    ['curl https://example.com', 'Netzwerk'],
    ['wget https://example.com', 'Netzwerk'],
    ['ssh host', 'Netzwerk'],
    ['ls | nc host 80', 'Netzwerk'],
    ['npm install', 'Interpreter'],
    ['npx tsc', 'Interpreter'],
    ['node -e "1"', 'Interpreter'],
    ['python3 x.py', 'Interpreter'],
    ['sh -c ls', 'Interpreter'],
    ['bash script.sh', 'Interpreter'],
    ['eval ls', 'Interpreter'],
    ['echo hi', 'echo'],
    ['FOO=1 ls', 'FOO=1'],
    ['xargs rm', 'xargs'],
    ['sort -o out.txt in.txt', 'sort'],
    ['rg --pre cat foo', 'rg'],
    ['uniq in.txt out.txt', 'uniq'],
    ['', 'Leerer Befehl'],
    ['ls &', 'Hintergrund'],
  ])('blockiert %s', (command, reasonPart) => {
    const decision = bash(command)
    expect(decision.allow).toBe(false)
    if (!decision.allow) expect(decision.reason).toContain(reasonPart)
  })
})

describe('decide — Werkzeuge', () => {
  it.each(['Read', 'Glob', 'Grep'])('erlaubt %s', (tool) => {
    expect(decide({ tool_name: tool, tool_input: { file_path: 'a', pattern: 'b' } })).toEqual({ allow: true })
  })

  it.each(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite'])('blockiert %s', (tool) => {
    const decision = decide({ tool_name: tool, tool_input: {} })
    expect(decision).toEqual({ allow: false, reason: expect.stringContaining(tool) })
  })

  it('blockiert Bash ohne Befehl und unbekannte Eingaben', () => {
    expect(decide({ tool_name: 'Bash', tool_input: {} }).allow).toBe(false)
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

  it('kürzt lange Ziele auf 200 Zeichen', () => {
    const target = toolTarget({ tool_name: 'Bash', tool_input: { command: 'x'.repeat(500) } })
    expect(target.length).toBeLessThanOrEqual(200)
    expect(target.endsWith('…')).toBe(true)
  })
})
