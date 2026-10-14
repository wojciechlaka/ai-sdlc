import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { EventEmitter } from 'events'
import type { RefinementInput } from './index'

const VALID_JSON_OUTPUT = JSON.stringify({
  type: 'refinement',
  result: {
    title: 'Add reconnect logic',
    userStory: 'Als Spieler möchte ich erneut beitreten können, damit mein Spielstand nicht verloren geht.',
    acceptanceCriteria: ['Player can rejoin'],
    affectedFiles: [{ path: 'src/game.ts', description: 'Add handler' }],
    risks: [],
    openQuestions: [],
    confidence: 90,
  },
})

const STREAM_JSON_RESULT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  result: VALID_JSON_OUTPUT,
  cost_usd: 0.0421,
  usage: { input_tokens: 12345, output_tokens: 678, cache_read_input_tokens: 0 },
})

const STREAM_JSON_RESULT_NO_USAGE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  result: VALID_JSON_OUTPUT,
})

function makeFakeProcess(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as any
  proc.stdin = { write: vi.fn(), end: vi.fn() }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(stdout + '\n'))
    proc.emit('close', exitCode)
  }, 10)
  return proc
}

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

function makeResultWith(result: string) {
  return JSON.stringify({ type: 'result', subtype: 'success', result, cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } })
}

describe('JSON extraction (parseAndValidate)', () => {
  beforeAll(async () => { await import('./index') })
  beforeEach(() => { vi.clearAllMocks() })

  const EXTRACT_INPUT: RefinementInput = {
    ticketId: 'ticket-x', title: 'T', description: 'D', acceptanceCriteria: '',
    repoPath: '/tmp/repo', model: 'claude-sonnet-4-6',
  }

  it('parses plain JSON output', async () => {
    mockSpawn.mockImplementation(() => makeFakeProcess(makeResultWith(VALID_JSON_OUTPUT), 0) as any)
    const { runRefinement } = await import('./index')
    const { output } = await runRefinement(EXTRACT_INPUT, vi.fn())
    expect(output.type).toBe('refinement')
    if (output.type === 'refinement') expect(output.result.title).toBe('Add reconnect logic')
  })

  it('parses JSON wrapped in ```json code fence', async () => {
    const wrapped = '```json\n' + VALID_JSON_OUTPUT + '\n```'
    mockSpawn.mockImplementation(() => makeFakeProcess(makeResultWith(wrapped), 0) as any)
    const { runRefinement } = await import('./index')
    const { output } = await runRefinement(EXTRACT_INPUT, vi.fn())
    expect(output.type).toBe('refinement')
    if (output.type === 'refinement') expect(output.result.title).toBe('Add reconnect logic')
  })

  it('parses JSON preceded by explanation text', async () => {
    const withPreamble = 'Here is my analysis:\n\n' + VALID_JSON_OUTPUT
    mockSpawn.mockImplementation(() => makeFakeProcess(makeResultWith(withPreamble), 0) as any)
    const { runRefinement } = await import('./index')
    const { output } = await runRefinement(EXTRACT_INPUT, vi.fn())
    expect(output.type).toBe('refinement')
    if (output.type === 'refinement') expect(output.result.title).toBe('Add reconnect logic')
  })
})

describe('runRefinement', () => {
  beforeAll(async () => { await import('./index') }) // warm up module cache
  beforeEach(() => { vi.clearAllMocks() })

  const INPUT: RefinementInput = {
    ticketId: 'ticket-123',
    title: 'Add reconnect logic',
    description: 'Players drop.',
    acceptanceCriteria: '',
    repoPath: '/tmp/repo',
    model: 'claude-sonnet-4-6',
  }

  it('returns validated RefinementOutput on success', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(STREAM_JSON_RESULT, 0) as any)
    const { runRefinement } = await import('./index')
    const { output, meta } = await runRefinement(INPUT, vi.fn())
    expect(output.type).toBe('refinement')
    if (output.type === 'refinement') {
      expect(output.result.title).toBe('Add reconnect logic')
      expect(output.result.confidence).toBe(90)
    }
    expect(meta.model).toBe('claude-sonnet-4-6')
    expect(meta.durationSeconds).toBeGreaterThanOrEqual(0)
    expect(meta.inputTokens).toBe(12345)
    expect(meta.outputTokens).toBe(678)
    expect(meta.costUsd).toBe(0.0421)
  })

  it('falls back to zero tokens when usage is absent in CLI output', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(STREAM_JSON_RESULT_NO_USAGE, 0) as any)
    const { runRefinement } = await import('./index')
    const { meta } = await runRefinement(INPUT, vi.fn())
    expect(meta.inputTokens).toBe(0)
    expect(meta.outputTokens).toBe(0)
    expect(meta.costUsd).toBe(0)
  })

  it('retries once on schema validation failure, then throws SchemaValidationError', async () => {
    const INVALID = JSON.stringify({ type: 'result', subtype: 'success', result: '{"title": "x"}' })
    mockSpawn.mockImplementation(() => makeFakeProcess(INVALID, 0) as any)
    const { runRefinement } = await import('./index')
    const { SchemaValidationError } = await import('./errors')
    await expect(runRefinement(INPUT, vi.fn())).rejects.toBeInstanceOf(SchemaValidationError)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('throws CliError on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess('', 1) as any)
    const { runRefinement } = await import('./index')
    const { CliError } = await import('./errors')
    await expect(runRefinement(INPUT, vi.fn())).rejects.toBeInstanceOf(CliError)
  })

  it('throws TimeoutError when claude does not respond in time', async () => {
    const proc = new EventEmitter() as any
    proc.stdin = { write: vi.fn(), end: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc as any)
    process.env['REFINEMENT_TIMEOUT_MS'] = '50'
    const { runRefinement } = await import('./index')
    const { TimeoutError } = await import('./errors')
    await expect(runRefinement(INPUT, vi.fn())).rejects.toBeInstanceOf(TimeoutError)
    delete process.env['REFINEMENT_TIMEOUT_MS']
  })
})
