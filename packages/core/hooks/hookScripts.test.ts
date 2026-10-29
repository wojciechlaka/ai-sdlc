import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// guard.mjs and audit.mjs as real processes, the way Claude Code runs them: JSON on stdin, decision on stdout.

let dir: string
let logFile: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'))
  logFile = path.join(dir, 'tools.jsonl')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function runHook(script: 'guard.mjs' | 'audit.mjs', stdin: string, env: Record<string, string | undefined> = { REFINEMENT_HOOK_LOG: logFile }) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    input: stdin,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf-8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const logLines = () => fs.existsSync(logFile)
  ? fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  : []

const hookInput = (event: string, tool_name: string, tool_input: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({
  session_id: 's', transcript_path: '/t', cwd: '/repo', hook_event_name: event, tool_name, tool_input, tool_use_id: 'u', ...extra,
})

describe('guard.mjs (PreToolUse)', () => {
  it('lets read-only calls through without output and logs nothing', () => {
    const result = runHook('guard.mjs', hookInput('PreToolUse', 'Bash', { command: 'git log -5' }))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(logLines()).toEqual([])
  })

  it('denies forbidden commands with a reason and logs them', () => {
    const result = runHook('guard.mjs', hookInput('PreToolUse', 'Bash', { command: 'rm -rf docs' }))
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' })
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('rm')
    expect(logLines()).toEqual([
      { kind: 'blocked', tool: 'Bash', target: 'rm -rf docs', reason: expect.stringContaining('rm'), at: expect.any(String) },
    ])
  })

  it('denies writing tools, path relative to the working directory', () => {
    runHook('guard.mjs', hookInput('PreToolUse', 'Write', { file_path: '/repo/src/app.ts', content: 'x' }))
    expect(logLines()).toEqual([expect.objectContaining({ kind: 'blocked', tool: 'Write', target: 'src/app.ts' })])
  })

  it('denies on errors (fail closed)', () => {
    const result = runHook('guard.mjs', 'kein json')
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('Guard-Fehler')
    expect(logLines()).toEqual([expect.objectContaining({ kind: 'blocked', reason: expect.stringContaining('Guard-Fehler') })])
  })

  it('decides without a log file too', () => {
    const result = runHook('guard.mjs', hookInput('PreToolUse', 'Bash', { command: 'git push' }), { REFINEMENT_HOOK_LOG: undefined })
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('deny')
  })
})

describe('audit.mjs (PostToolUse)', () => {
  it('records tool and target', () => {
    runHook('audit.mjs', hookInput('PostToolUse', 'Bash', { command: 'git log -5' }, { tool_response: { stdout: 'x', stderr: '', interrupted: false } }))
    runHook('audit.mjs', hookInput('PostToolUse', 'Read', { file_path: '/repo/src/app.ts' }, { tool_response: { type: 'text' } }))
    expect(logLines()).toEqual([
      { kind: 'used', tool: 'Bash', target: 'git log -5', at: expect.any(String) },
      { kind: 'used', tool: 'Read', target: 'src/app.ts', at: expect.any(String) },
    ])
  })

  it('copes with any tool response', () => {
    runHook('audit.mjs', hookInput('PostToolUse', 'Bash', { command: 'ls' }, { tool_response: 'nur Text' }))
    expect(logLines()).toEqual([{ kind: 'used', tool: 'Bash', target: 'ls', at: expect.any(String) }])
  })

  it('never fails hard (fail open)', () => {
    expect(runHook('audit.mjs', 'kein json').status).toBe(0)
    expect(runHook('audit.mjs', hookInput('PostToolUse', 'Read', { file_path: 'a' }), { REFINEMENT_HOOK_LOG: path.join(dir, 'fehlt', 'x.jsonl') }).status).toBe(0)
    expect(logLines()).toEqual([])
  })
})
