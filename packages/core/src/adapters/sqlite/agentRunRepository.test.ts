import { describe, it, expect, beforeEach } from 'vitest'
import type { AgentOutput } from '@refinement/shared'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAgentRunRepository } from './agentRunRepository'
import type { AgentRunRepository, TicketRepository } from '../../ports'

const INPUT = {
  ticketTitle: 'Test', ticketDescription: 'Desc', acceptanceCriteria: '',
  repo: 'https://github.com/example/repo', model: 'claude-sonnet-4-6',
}

const OUTPUT: AgentOutput = {
  type: 'refinement',
  result: { title: 'Test', userStory: 'Als Nutzer...', acceptanceCriteria: ['AC 1'], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

const NO_TOKENS = { costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 }

let tickets: TicketRepository
let runs: AgentRunRepository

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  runs = createSqliteAgentRunRepository(db)
})

function newTicketId(): number {
  return tickets.create({ title: 'T', description: 'D' }).id
}

describe('create', () => {
  it('creates a running run and increments the ticket iteration', () => {
    const ticketId = newTicketId()
    const run = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    expect(run.status).toBe('running')
    expect(run.iteration).toBe(1)
    expect(run.trigger).toBe('initial')
    expect(tickets.findById(ticketId)?.iteration).toBe(1)
  })

  it('throws for an unknown ticket', () => {
    expect(() => runs.create({ ticketId: 9999, trigger: 'initial', input: INPUT, model: 'm' })).toThrow('not found')
  })
})

describe('findById', () => {
  it('returns the run or null', () => {
    const run = runs.create({ ticketId: newTicketId(), trigger: 'initial', input: INPUT, model: 'm' })
    expect(runs.findById(run.id)?.id).toBe(run.id)
    expect(runs.findById('nope')).toBeNull()
  })
})

describe('complete / fail', () => {
  it('stores output and tokens on complete', () => {
    const run = runs.create({ ticketId: newTicketId(), trigger: 'initial', input: INPUT, model: 'm' })
    runs.complete(run.id, { output: OUTPUT, costUsd: 0.05, inputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 200 })
    const updated = runs.findById(run.id)!
    expect(updated.status).toBe('succeeded')
    expect(updated.output?.type).toBe('refinement')
    expect(updated.costUsd).toBe(0.05)
    expect(updated.finishedAt).toBeInstanceOf(Date)
  })

  it('sets failed or timeout on fail', () => {
    const ticketId = newTicketId()
    const a = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    const b = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.fail(a.id, 'failed')
    runs.fail(b.id, 'timeout')
    expect(runs.findById(a.id)?.status).toBe('failed')
    expect(runs.findById(b.id)?.status).toBe('timeout')
  })
})

describe('listForTicket / latestForTicket', () => {
  it('returns runs in iteration order and the latest regardless of status', () => {
    const ticketId = newTicketId()
    const first = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.complete(first.id, { output: { type: 'question', question: 'Q?' }, ...NO_TOKENS })
    const second = runs.create({
      ticketId, trigger: 'answer', model: 'm',
      input: { ...INPUT, previousRuns: [{ question: 'Q?', answer: 'A' }] },
    })

    expect(runs.listForTicket(ticketId).map((r) => r.id)).toEqual([first.id, second.id])
    expect(runs.latestForTicket(ticketId)?.id).toBe(second.id)
    expect(runs.latestForTicket(ticketId)?.status).toBe('running')
  })

  it('returns empty results for a ticket without runs', () => {
    const ticketId = newTicketId()
    expect(runs.listForTicket(ticketId)).toEqual([])
    expect(runs.latestForTicket(ticketId)).toBeNull()
  })
})

describe('findStuck', () => {
  it('returns only running runs', () => {
    const ticketId = newTicketId()
    const running = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    const failed = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.fail(failed.id, 'failed')
    const ids = runs.findStuck().map((r) => r.id)
    expect(ids).toContain(running.id)
    expect(ids).not.toContain(failed.id)
  })
})

describe('cascade', () => {
  it('deletes runs together with their ticket', () => {
    const ticketId = newTicketId()
    const run = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    tickets.delete(ticketId)
    expect(runs.findById(run.id)).toBeNull()
  })
})
