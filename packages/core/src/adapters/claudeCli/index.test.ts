import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import type { AgentRunnerInput } from '../../ports'

const HOOKS_DIR = path.resolve(__dirname, '../../../hooks')
const OPTIONS = { skillsDir: path.resolve(__dirname, '../../../skills'), hooksDir: HOOKS_DIR }

const callbacks = () => ({ onProgress: vi.fn(), onToolEvent: vi.fn() })

const INTENT_OUTPUT = JSON.stringify({
  type: 'intent',
  result: {
    title: 'Lesezeit anzeigen',
    problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
    desiredOutcome: 'Die API liefert eine Lesezeit.',
    affected: ['Leser'],
    openPoints: [],
  },
})

const resultLine = (result: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'result', subtype: 'success', result, ...extra })

function makeFakeProcess(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as any
  proc.stdin = { write: vi.fn(), end: vi.fn() }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(stdout + '\n'))
    proc.emit('close', exitCode)
  }, 10)
  return proc
}

vi.mock('child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

const INPUT: AgentRunnerInput = {
  ticketKey: 'CB-2', stage: 'plan', title: 'Lesezeit', description: 'D', repoPath: '/tmp/repo',
  model: 'claude-sonnet-4-6', previousRuns: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runAgent (stage plan)', () => {
  it.each([
    ['plain JSON', INTENT_OUTPUT],
    ['a json code fence', '```json\n' + INTENT_OUTPUT + '\n```'],
    ['text before the JSON', 'Hier ist das Ergebnis:\n\n' + INTENT_OUTPUT],
  ])('parses %s', async (_label, text) => {
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(text), 0))
    const { runAgent } = await import('./index')
    const { output } = await runAgent(INPUT, callbacks(), OPTIONS)
    expect(output).toMatchObject({ type: 'intent', result: { title: 'Lesezeit anzeigen' } })
  })

  it('sends the intent skill and reports usage', async () => {
    const proc = makeFakeProcess(
      resultLine(INTENT_OUTPUT, { cost_usd: 0.04, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 } }),
      0,
    )
    mockSpawn.mockReturnValue(proc)
    const { runAgent } = await import('./index')
    const { meta } = await runAgent(INPUT, callbacks(), OPTIONS)
    expect(proc.stdin.write.mock.calls[0][0]).toContain('# Intent Agent Skill')
    expect(meta).toMatchObject({ model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, costUsd: 0.04 })
  })

  it('prefers total_cost_usd over cost_usd', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(resultLine(INTENT_OUTPUT, { total_cost_usd: 0.07, cost_usd: 0.01 }), 0))
    const { runAgent } = await import('./index')
    const { meta } = await runAgent(INPUT, callbacks(), OPTIONS)
    expect(meta.costUsd).toBe(0.07)
  })

  it('retries once on invalid output, then throws SchemaValidationError', async () => {
    const refinement = JSON.stringify({ type: 'refinement', result: {} })
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(refinement), 0))
    const { runAgent } = await import('./index')
    const { SchemaValidationError } = await import('./errors')
    await expect(runAgent(INPUT, callbacks(), OPTIONS)).rejects.toBeInstanceOf(SchemaValidationError)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('throws CliError on a non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess('', 1))
    const { runAgent } = await import('./index')
    const { CliError } = await import('./errors')
    await expect(runAgent(INPUT, callbacks(), OPTIONS)).rejects.toBeInstanceOf(CliError)
  })

  it('throws AgentRunTimeoutError when claude does not answer in time', async () => {
    const proc = new EventEmitter() as any
    proc.stdin = { write: vi.fn(), end: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)
    vi.stubEnv('REFINEMENT_TIMEOUT_MS', '50')
    const { runAgent } = await import('./index')
    const { AgentRunTimeoutError } = await import('../../ports')
    await expect(runAgent(INPUT, callbacks(), OPTIONS)).rejects.toBeInstanceOf(AgentRunTimeoutError)
  })

  it('rejects stages without an agent before spawning claude', async () => {
    const { runAgent } = await import('./index')
    await expect(runAgent({ ...INPUT, stage: 'design' }, callbacks(), OPTIONS)).rejects.toThrow('design')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

describe('runAgent — guard and audit hooks (spec §13)', () => {
  type SpawnOptions = { env: Record<string, string> }
  const spawnCall = (index = 0) => {
    const [command, args, options] = mockSpawn.mock.calls[index] as unknown as [string, string[], SpawnOptions]
    return { command, args, options, logFile: options.env.REFINEMENT_HOOK_LOG }
  }
  const argAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

  it('passes guard and audit as hooks for all tools and only read tools', async () => {
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(INTENT_OUTPUT), 0))
    const { runAgent } = await import('./index')
    await runAgent(INPUT, callbacks(), OPTIONS)

    const { args, logFile } = spawnCall()
    expect(argAfter(args, '--allowedTools')).toBe('Read,Glob,Grep,Bash')
    const settings = JSON.parse(argAfter(args, '--settings'))
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: '', hooks: [{ type: 'command', timeout: 10, command: expect.stringContaining(path.join(HOOKS_DIR, 'guard.mjs')) }] }])
    expect(settings.hooks.PostToolUse).toEqual([{ matcher: '', hooks: [{ type: 'command', timeout: 10, command: expect.stringContaining(path.join(HOOKS_DIR, 'audit.mjs')) }] }])
    expect(logFile).toMatch(/tools\.jsonl$/)
    expect(fs.existsSync(logFile)).toBe(false) // removed after the run
  })

  it('reports hook log lines while the run lasts and drains the rest at the end', async () => {
    const proc = new EventEmitter() as any
    proc.stdin = { write: vi.fn(), end: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)
    const cb = callbacks()
    const { runAgent } = await import('./index')
    const run = runAgent(INPUT, cb, OPTIONS)

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled())
    const { logFile } = spawnCall()
    const blocked = JSON.stringify({ kind: 'blocked', tool: 'Bash', target: 'rm -rf docs', reason: 'nein', at: 'x' })
    fs.appendFileSync(logFile, blocked.slice(0, 20)) // partial line: not reported yet
    fs.appendFileSync(logFile, blocked.slice(20) + '\nkein json\n')
    await vi.waitFor(() => expect(cb.onToolEvent).toHaveBeenCalledTimes(1))
    expect(cb.onToolEvent).toHaveBeenCalledWith({ kind: 'blocked', tool: 'Bash', target: 'rm -rf docs', reason: 'nein' })

    fs.appendFileSync(logFile, JSON.stringify({ kind: 'used', tool: 'Bash', target: 'git log -5', exitCode: 0 }) + '\n')
    proc.stdout.emit('data', Buffer.from(resultLine(INTENT_OUTPUT) + '\n'))
    proc.emit('close', 0)
    await run

    expect(cb.onToolEvent).toHaveBeenLastCalledWith({ kind: 'used', tool: 'Bash', target: 'git log -5', exitCode: 0 })
    expect(cb.onToolEvent).toHaveBeenCalledTimes(2)
    expect(fs.existsSync(logFile)).toBe(false)
  })

  it('uses the hooks on the retry attempt as well, each with its own log file', async () => {
    const refinement = JSON.stringify({ type: 'refinement', result: {} })
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(refinement), 0))
    const { runAgent } = await import('./index')
    await expect(runAgent(INPUT, callbacks(), OPTIONS)).rejects.toThrow()

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(argAfter(spawnCall(1).args, '--settings')).toContain('guard.mjs')
    expect(spawnCall(1).logFile).not.toBe(spawnCall(0).logFile)
  })
})

describe('createClaudeCliAgentRunner', () => {
  it('runs through the AgentRunner port', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(resultLine(INTENT_OUTPUT), 0))
    const { createClaudeCliAgentRunner } = await import('./index')
    const { output } = await createClaudeCliAgentRunner(OPTIONS).run(INPUT, callbacks())
    expect(output.type).toBe('intent')
  })

  it('returns false when stopping a ticket without a running process', async () => {
    const { createClaudeCliAgentRunner } = await import('./index')
    expect(createClaudeCliAgentRunner(OPTIONS).stop('CB-404')).toBe(false)
  })
})
