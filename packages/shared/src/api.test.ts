import { describe, it, expect } from 'vitest'
import { AnswerInputSchema, StartStageInputSchema, TicketDetailSchema, TicketSchema } from './api'

const NOW = new Date('2026-10-28T10:00:00Z')

const TICKET = {
  key: 'CB-2',
  title: 'Lesezeit bei Artikeln anzeigen',
  description: 'Leser möchten vorher sehen, wie lange ein Artikel dauert.',
  priority: 'Mittel',
  sourcePath: 'examples/tickets/cb-2-lesezeit.md',
  stage: 'plan' as const,
  state: 'ready' as const,
  openPr: null,
  updatedAt: NOW,
}

describe('TicketSchema', () => {
  it('accepts a ticket with a KEY-n key', () => {
    expect(TicketSchema.parse(TICKET)).toEqual(TICKET)
  })

  it('rejects keys that are not upper-case KEY-n', () => {
    expect(TicketSchema.safeParse({ ...TICKET, key: 'cb-2' }).success).toBe(false)
    expect(TicketSchema.safeParse({ ...TICKET, key: 'CB2' }).success).toBe(false)
  })

  it('rejects unknown stages and states', () => {
    expect(TicketSchema.safeParse({ ...TICKET, stage: 'build' }).success).toBe(false)
    expect(TicketSchema.safeParse({ ...TICKET, state: 'refining' }).success).toBe(false)
  })
})

describe('TicketDetailSchema', () => {
  it('accepts stages, log and a pending question', () => {
    const detail = TicketDetailSchema.parse({
      ...TICKET,
      state: 'awaiting_answer',
      stages: [{
        stage: 'plan', path: 'docs/work/CB-2/intent.md',
        fileUrl: 'https://github.com/o/r/blob/showcase/docs/work/CB-2/intent.md',
        completed: false, pr: null, mergedAt: null, content: null,
      }],
      log: [{ actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' }, createdAt: NOW }],
      pendingQuestion: 'Wer?',
    })
    expect(detail.pendingQuestion).toBe('Wer?')
    expect(detail.stages[0]?.stage).toBe('plan')
  })
})

describe('inputs', () => {
  it('StartStageInputSchema requires a model', () => {
    expect(StartStageInputSchema.safeParse({ model: ' ' }).success).toBe(false)
    expect(StartStageInputSchema.parse({ model: 'claude-sonnet-4-6' })).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('AnswerInputSchema rejects blank answers', () => {
    expect(AnswerInputSchema.safeParse({ answer: '  ' }).success).toBe(false)
  })
})
