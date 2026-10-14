import { describe, it, expect, beforeEach } from 'vitest'
import { createAgentRun, getAgentRun, completeAgentRun, failAgentRun, findStuckRuns, getLatestRun, getRunsForTicket } from './agentRuns'
import { createTicket, getTicket } from './tickets'
import { db } from './client'
import { tickets, agentRuns } from './schema'
import type { AgentOutput } from '@refinement/shared'

const SAMPLE_INPUT = {
  ticketTitle: 'Test',
  ticketDescription: 'Desc',
  acceptanceCriteria: '',
  repo: 'https://github.com/example/repo',
  model: 'claude-sonnet-4-6',
}

const SAMPLE_OUTPUT: AgentOutput = {
  type: 'refinement',
  result: {
    title: 'Test',
    userStory: 'Als Nutzer...',
    acceptanceCriteria: ['AC 1'],
    affectedFiles: [],
    risks: [],
    openQuestions: [],
    confidence: 80,
  },
}

beforeEach(() => {
  db.delete(agentRuns).run()
  db.delete(tickets).run()
})

describe('createAgentRun', () => {
  it('creates a run with status running and increments ticket iteration', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    expect(ticket.iteration).toBe(0)

    const run = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })

    expect(run.status).toBe('running')
    expect(run.ticketId).toBe(ticket.id)
    expect(run.iteration).toBe(1)
    expect(run.trigger).toBe('initial')
  })

  it('increments ticket iteration', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    expect(getTicket(ticket.id).iteration).toBe(1)
  })
})

describe('getAgentRun', () => {
  it('returns run by id', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    const run = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    expect(getAgentRun(run.id).id).toBe(run.id)
  })

  it('throws for unknown id', () => {
    expect(() => getAgentRun('nope')).toThrow('not found')
  })
})

describe('completeAgentRun', () => {
  it('sets status to succeeded and stores output', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    const run = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    completeAgentRun(run.id, { output: SAMPLE_OUTPUT, costUsd: 0.05, inputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 200 })
    const updated = getAgentRun(run.id)
    expect(updated.status).toBe('succeeded')
    expect(updated.output).not.toBeNull()
    expect((updated.output as any).type).toBe('refinement')
    expect((updated.output as AgentOutput & { type: 'refinement' }).result.confidence).toBe(80)
    expect(updated.finishedAt).toBeTruthy()
  })
})

describe('failAgentRun', () => {
  it('sets status to failed', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    const run = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    failAgentRun(run.id, 'failed')
    expect(getAgentRun(run.id).status).toBe('failed')
  })

  it('sets status to timeout', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    const run = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    failAgentRun(run.id, 'timeout')
    expect(getAgentRun(run.id).status).toBe('timeout')
  })
})

describe('findStuckRuns', () => {
  it('returns only running runs', () => {
    const ticket = createTicket({ title: 'T', description: '' })
    const run1 = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    const run2 = createAgentRun({ ticketId: ticket.id, trigger: 'initial', input: SAMPLE_INPUT, model: 'claude-sonnet-4-6' })
    failAgentRun(run2.id, 'failed')
    const stuck = findStuckRuns()
    expect(stuck.map(r => r.id)).toContain(run1.id)
    expect(stuck.map(r => r.id)).not.toContain(run2.id)
  })
})

describe('getLatestRun', () => {
  it('returns the latest run regardless of status', () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    const run1 = createAgentRun({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    completeAgentRun(run1.id, {
      output: { type: 'question', question: 'Which DB?' },
      costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
    const run2 = createAgentRun({
      ticketId: ticket.id, trigger: 'answer', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm', previousRuns: [{ question: 'Which DB?', answer: 'Postgres' }] },
    })
    // intentionally left running — verifies getLatestRun does not filter by status
    const latest = getLatestRun(ticket.id)
    expect(latest?.id).toBe(run2.id)
    expect(latest?.status).toBe('running')
  })

  it('returns null for ticket with no runs', () => {
    const ticket = createTicket({ title: 'Empty', description: 'D' })
    expect(getLatestRun(ticket.id)).toBeNull()
  })
})

describe('getRunsForTicket', () => {
  it('returns all runs for a ticket in iteration order', () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    const run1 = createAgentRun({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    completeAgentRun(run1.id, {
      output: { type: 'question', question: 'Q?' },
      costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
    const run2 = createAgentRun({
      ticketId: ticket.id, trigger: 'answer', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm', previousRuns: [{ question: 'Q?', answer: 'A' }] },
    })
    const runs = getRunsForTicket(ticket.id)
    expect(runs).toHaveLength(2)
    expect(runs[0].id).toBe(run1.id)
    expect(runs[1].id).toBe(run2.id)
    expect(runs[1].trigger).toBe('answer')
  })

  it('returns empty array for ticket with no runs', () => {
    const ticket = createTicket({ title: 'Empty', description: 'D' })
    expect(getRunsForTicket(ticket.id)).toEqual([])
  })
})
