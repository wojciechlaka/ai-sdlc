import { describe, it, expect } from 'vitest'
import { AnswerInputSchema, CostSummarySchema, StartStageInputSchema, TicketDetailSchema, TicketSchema } from './api'

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
  totalCostUsd: 0.11,
}

const NO_COST = { usd: 0, runs: 0, inputTokens: 0, outputTokens: 0 }
const COSTS = {
  totalUsd: 0.11, runs: 4, inputTokens: 13_500, outputTokens: 1_200,
  byStage: { plan: { usd: 0.11, runs: 4, inputTokens: 13_500, outputTokens: 1_200 }, design: NO_COST },
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
      pendingChoice: null,
      questionsAsked: 1,
      questionLimit: null,
      costs: COSTS,
    })
    expect(detail.pendingQuestion).toBe('Wer?')
    expect(detail.stages[0]?.stage).toBe('plan')
  })

  it('accepts a pending choice with the question counter of stage 2', () => {
    const pendingChoice = {
      question: 'Wo?', recommended: 'B',
      options: [{ id: 'A', title: 'a', description: 'd', pros: [], cons: [] }, { id: 'B', title: 'b', description: 'd', pros: ['+'], cons: [] }],
    }
    const detail = TicketDetailSchema.parse({
      ...TICKET, stage: 'design', state: 'awaiting_answer', stages: [], log: [], costs: COSTS,
      pendingQuestion: null, pendingChoice, questionsAsked: 2, questionLimit: 3,
    })
    expect(detail.pendingChoice?.recommended).toBe('B')
    expect(TicketDetailSchema.safeParse({ ...detail, pendingChoice: { ...pendingChoice, recommended: 'C' } }).success).toBe(false)
  })
})

describe('inputs', () => {
  it('StartStageInputSchema requires a model', () => {
    expect(StartStageInputSchema.safeParse({ model: ' ' }).success).toBe(false)
    expect(StartStageInputSchema.parse({ model: 'claude-sonnet-4-6' })).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('AnswerInputSchema rejects blank answers', () => {
    expect(AnswerInputSchema.safeParse({ answer: '  ' }).error?.issues.map((issue) => issue.message)).toEqual(['Antwort ist erforderlich'])
  })

  it('AnswerInputSchema accepts a picked option with or without a note', () => {
    expect(AnswerInputSchema.parse({ choice: 'B' })).toEqual({ choice: 'B' })
    expect(AnswerInputSchema.parse({ choice: 'A', note: 'ohne Cache' })).toEqual({ choice: 'A', note: 'ohne Cache' })
  })

  it('AnswerInputSchema rejects unknown ids, both shapes at once and empty input with a German message', () => {
    for (const input of [{ choice: 'D' }, { answer: 'x', choice: 'A' }, {}]) {
      expect(AnswerInputSchema.safeParse(input).error?.issues.map((issue) => issue.message)).toEqual(['Antwort oder Auswahl ist erforderlich'])
    }
  })
})

describe('CostSummarySchema', () => {
  it('accepts a summary with both artifact stages', () => {
    expect(CostSummarySchema.parse(COSTS)).toEqual(COSTS)
  })

  it('requires both stages and whole run counts', () => {
    expect(CostSummarySchema.safeParse({ ...COSTS, byStage: { plan: NO_COST } }).success).toBe(false)
    expect(CostSummarySchema.safeParse({ ...COSTS, runs: 1.5 }).success).toBe(false)
  })

  it('is required on the ticket page and the board ticket', () => {
    const { totalCostUsd: _omit, ...withoutTotal } = TICKET
    expect(TicketSchema.safeParse(withoutTotal).success).toBe(false)
    expect(TicketDetailSchema.safeParse({
      ...TICKET, stages: [], log: [], pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null,
    }).success).toBe(false)
  })
})
