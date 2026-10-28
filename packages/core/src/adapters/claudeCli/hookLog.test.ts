import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import path from 'path'
import { hookSettings, parseToolEvent } from './hookLog'

const HOOKS_DIR = path.resolve(__dirname, '../../../hooks')

describe('hookSettings', () => {
  it('builds commands that run the real guard through /bin/sh, like Claude Code does', () => {
    const settings = JSON.parse(hookSettings(HOOKS_DIR))
    const command = settings.hooks.PreToolUse[0].hooks[0].command as string
    const result = spawnSync('/bin/sh', ['-c', command], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: '/repo' }),
      env: { PATH: process.env.PATH },
      encoding: 'utf-8',
    })
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny')
  })
})

describe('parseToolEvent', () => {
  it.each([
    ['{"kind":"used","tool":"Read","target":"a.ts","at":"x"}', { kind: 'used', tool: 'Read', target: 'a.ts' }],
    ['{"kind":"blocked","tool":"Bash","target":"rm x","reason":"nein"}', { kind: 'blocked', tool: 'Bash', target: 'rm x', reason: 'nein' }],
    ['{"kind":"used","tool":"Bash","target":"ls","exitCode":2}', { kind: 'used', tool: 'Bash', target: 'ls', exitCode: 2 }],
    ['{"kind":"other","tool":"Bash"}', null],
    ['{"kind":"used"}', null],
    ['kein json', null],
    ['', null],
  ])('parses %s', (line, expected) => {
    expect(parseToolEvent(line)).toEqual(expected)
  })
})
