import { describe, it, expect } from 'vitest'
import {
  TicketSchema,
  TicketDetailSchema,
  CreateTicketInput,
  StartRefinementInput,
  AnswerInput,
} from './api'

const NOW = new Date('2026-10-28T10:00:00Z')

const TICKET = {
  id: 'T-1',
  title: 'CC-2: Timer',
  description: 'Desc',
  status: 'backlog' as const,
  iteration: 0,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('TicketSchema', () => {
  it('accepts a ticket with a T-{n} id', () => {
    expect(TicketSchema.parse(TICKET)).toEqual(TICKET)
  })

  it('rejects numeric ids', () => {
    expect(TicketSchema.safeParse({ ...TICKET, id: 1 }).success).toBe(false)
  })

  it('rejects unknown status values', () => {
    expect(TicketSchema.safeParse({ ...TICKET, status: 'done' }).success).toBe(false)
  })
})

describe('TicketDetailSchema', () => {
  it('accepts a ticket without runs', () => {
    expect(TicketDetailSchema.parse({ ...TICKET, latestRun: null }).latestRun).toBeNull()
  })

  it('accepts a ticket with a running run', () => {
    const run = {
      id: 'abc', ticketId: 'T-1', iteration: 1, trigger: 'initial', status: 'running', model: 'm',
      output: null, costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null,
      outputTokens: null, startedAt: NOW, finishedAt: null,
    }
    expect(TicketDetailSchema.parse({ ...TICKET, latestRun: run }).latestRun?.id).toBe('abc')
  })
})

describe('CreateTicketInput', () => {
  it('requires a non-blank title and description', () => {
    expect(CreateTicketInput.safeParse({ title: '  ', description: 'x' }).success).toBe(false)
    expect(CreateTicketInput.safeParse({ title: 'x', description: '' }).success).toBe(false)
    expect(CreateTicketInput.parse({ title: 'x', description: 'y' })).toEqual({ title: 'x', description: 'y' })
  })
})

describe('StartRefinementInput', () => {
  it('defaults acceptanceCriteria to an empty string', () => {
    expect(StartRefinementInput.parse({ repo: 'git@github.com:a/b.git', model: 'm' })).toEqual({
      repo: 'git@github.com:a/b.git', model: 'm', acceptanceCriteria: '',
    })
  })

  it('requires repo and model', () => {
    expect(StartRefinementInput.safeParse({ repo: '', model: 'm' }).success).toBe(false)
    expect(StartRefinementInput.safeParse({ repo: 'r' }).success).toBe(false)
  })
})

describe('AnswerInput', () => {
  it('rejects blank answers', () => {
    expect(AnswerInput.safeParse({ answer: '   ' }).success).toBe(false)
    expect(AnswerInput.parse({ answer: 'Postgres' })).toEqual({ answer: 'Postgres' })
  })
})
