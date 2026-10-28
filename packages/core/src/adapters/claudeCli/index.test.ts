import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import path from 'path'
import type { AgentRunnerInput } from '../../ports'

const OPTIONS = { skillsDir: path.resolve(__dirname, '../../../skills') }

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

describe('runAgent (stage plan)', () => {
  it.each([
    ['plain JSON', INTENT_OUTPUT],
    ['a json code fence', '```json\n' + INTENT_OUTPUT + '\n```'],
    ['text before the JSON', 'Hier ist das Ergebnis:\n\n' + INTENT_OUTPUT],
  ])('parses %s', async (_label, text) => {
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(text), 0))
    const { runAgent } = await import('./index')
    const { output } = await runAgent(INPUT, vi.fn(), OPTIONS)
    expect(output).toMatchObject({ type: 'intent', result: { title: 'Lesezeit anzeigen' } })
  })

  it('sends the intent skill and reports usage', async () => {
    const proc = makeFakeProcess(
      resultLine(INTENT_OUTPUT, { cost_usd: 0.04, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 } }),
      0,
    )
    mockSpawn.mockReturnValue(proc)
    const { runAgent } = await import('./index')
    const { meta } = await runAgent(INPUT, vi.fn(), OPTIONS)
    expect(proc.stdin.write.mock.calls[0][0]).toContain('# Intent Agent Skill')
    expect(meta).toMatchObject({ model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, costUsd: 0.04 })
  })

  it('retries once on invalid output, then throws SchemaValidationError', async () => {
    const refinement = JSON.stringify({ type: 'refinement', result: {} })
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(refinement), 0))
    const { runAgent } = await import('./index')
    const { SchemaValidationError } = await import('./errors')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(SchemaValidationError)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('throws CliError on a non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess('', 1))
    const { runAgent } = await import('./index')
    const { CliError } = await import('./errors')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(CliError)
  })

  it('throws AgentRunTimeoutError when claude does not answer in time', async () => {
    const proc = new EventEmitter() as any
    proc.stdin = { write: vi.fn(), end: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)
    process.env['REFINEMENT_TIMEOUT_MS'] = '50'
    const { runAgent } = await import('./index')
    const { AgentRunTimeoutError } = await import('../../ports')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(AgentRunTimeoutError)
    delete process.env['REFINEMENT_TIMEOUT_MS']
  })

  it('rejects stages without an agent before spawning claude', async () => {
    const { runAgent } = await import('./index')
    await expect(runAgent({ ...INPUT, stage: 'design' }, vi.fn(), OPTIONS)).rejects.toThrow('design')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

describe('createClaudeCliAgentRunner', () => {
  it('runs through the AgentRunner port', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(resultLine(INTENT_OUTPUT), 0))
    const { createClaudeCliAgentRunner } = await import('./index')
    const { output } = await createClaudeCliAgentRunner(OPTIONS).run(INPUT, vi.fn())
    expect(output.type).toBe('intent')
  })

  it('returns false when stopping a ticket without a running process', async () => {
    const { createClaudeCliAgentRunner } = await import('./index')
    expect(createClaudeCliAgentRunner(OPTIONS).stop('CB-404')).toBe(false)
  })
})
