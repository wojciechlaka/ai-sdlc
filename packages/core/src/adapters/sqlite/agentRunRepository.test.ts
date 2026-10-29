import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { SAMPLE_INTENT_OUTPUT, sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAgentRunRepository } from './agentRunRepository'
import type { AgentRunRepository, TicketRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns } from './schema'

const INPUT = { model: 'm', answeredQuestions: [] }

let db: SqliteDb
let tickets: TicketRepository
let runs: AgentRunRepository

beforeEach(() => {
  db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  runs = createSqliteAgentRunRepository(db)
  tickets.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
})

const create = (ticketKey = 'CB-1', stage: 'plan' | 'design' = 'plan') =>
  runs.create({ ticketKey, stage, trigger: 'initial', input: INPUT, model: 'm' })

describe('create', () => {
  it('numbers runs per ticket and starts them running', () => {
    expect(create('CB-1')).toMatchObject({ seq: 1, status: 'running', stage: 'plan', output: null, input: INPUT })
    expect(create('CB-1').seq).toBe(2)
    expect(create('CB-2').seq).toBe(1)
  })

  it('throws for unknown tickets', () => {
    expect(() => create('CB-404')).toThrow()
  })
})

describe('input', () => {
  it('reads rows written before the rename (`previousRuns`) as answeredQuestions', () => {
    const qa = [{ question: 'Wer?', answer: 'Alle' }]
    const legacyInput = { model: 'm', previousRuns: qa } as unknown as typeof agentRuns.$inferInsert['input']
    const row = db.insert(agentRuns).values({
      ticketKey: 'CB-1', stage: 'plan', seq: 1, trigger: 'answer', input: legacyInput, status: 'succeeded', model: 'm', startedAt: new Date(),
    }).returning().get()
    expect(runs.findById(row.id)?.input).toEqual({ model: 'm', answeredQuestions: qa })
    expect(runs.listForTicket('CB-1')[0]?.input).toEqual({ model: 'm', answeredQuestions: qa })
  })
})

describe('complete / fail', () => {
  it('stores output, cost and tokens', () => {
    const run = create()
    runs.complete(run.id, {
      output: SAMPLE_INTENT_OUTPUT, costUsd: 0.5, inputTokens: 10, cacheCreationTokens: 1, cacheReadTokens: 2, outputTokens: 3,
    })
    expect(runs.findById(run.id)).toMatchObject({ status: 'succeeded', output: SAMPLE_INTENT_OUTPUT, costUsd: 0.5, outputTokens: 3 })
    expect(runs.findById(run.id)?.finishedAt).toBeInstanceOf(Date)
  })

  it('marks failures', () => {
    const run = create()
    runs.fail(run.id, 'timeout')
    expect(runs.findById(run.id)?.status).toBe('timeout')
  })
})

describe('listForTicket / findStuck', () => {
  it('lists runs of a ticket in order, optionally of one stage', () => {
    create('CB-1', 'plan')
    create('CB-1', 'design')
    create('CB-2', 'plan')
    expect(runs.listForTicket('CB-1').map((r) => r.seq)).toEqual([1, 2])
    expect(runs.listForTicket('CB-1', 'design').map((r) => r.seq)).toEqual([2])
  })

  it('finds runs left running', () => {
    const stuck = create()
    runs.fail(create().id, 'failed')
    expect(runs.findStuck().map((r) => r.id)).toEqual([stuck.id])
  })

  it('removes runs together with their tickets', () => {
    create()
    tickets.clear()
    expect(runs.findStuck()).toEqual([])
  })
})
