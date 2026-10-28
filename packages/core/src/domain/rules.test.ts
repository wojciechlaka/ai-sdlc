import { describe, it, expect } from 'vitest'
import type { AgentRun, Ticket } from './types'
import { canStartRefinement, isAnswerInProgress, canDelete, statusAfterRun, planAnswerRun } from './rules'

const NOW = new Date()

function ticket(status: Ticket['status']): Ticket {
  return { id: 1, title: 'T', description: 'D', status, iteration: 0, createdAt: NOW, updatedAt: NOW }
}

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'r', ticketId: 1, iteration: 1, trigger: 'initial',
    input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'repo', model: 'm' },
    output: null, status: 'succeeded', model: 'm', costUsd: null, inputTokens: null,
    cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null, startedAt: NOW, finishedAt: NOW,
    ...overrides,
  }
}

const REFINEMENT = {
  type: 'refinement' as const,
  result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

describe('canStartRefinement', () => {
  it('allows backlog and review only', () => {
    expect(canStartRefinement(ticket('backlog'))).toBe(true)
    expect(canStartRefinement(ticket('review'))).toBe(true)
    expect(canStartRefinement(ticket('refining'))).toBe(false)
    expect(canStartRefinement(ticket('failed'))).toBe(false)
    expect(canStartRefinement(ticket('ready'))).toBe(false)
  })
})

describe('isAnswerInProgress', () => {
  it('is true only for a running answer run', () => {
    expect(isAnswerInProgress(null)).toBe(false)
    expect(isAnswerInProgress(run({ trigger: 'answer', status: 'running' }))).toBe(true)
    expect(isAnswerInProgress(run({ trigger: 'answer', status: 'succeeded' }))).toBe(false)
    expect(isAnswerInProgress(run({ trigger: 'initial', status: 'running' }))).toBe(false)
  })
})

describe('canDelete', () => {
  it('forbids deleting while refining', () => {
    expect(canDelete(ticket('refining'))).toBe(false)
    expect(canDelete(ticket('backlog'))).toBe(true)
    expect(canDelete(ticket('failed'))).toBe(true)
  })
})

describe('statusAfterRun', () => {
  it('moves to review after a refinement and stays refining after a question', () => {
    expect(statusAfterRun(REFINEMENT)).toBe('review')
    expect(statusAfterRun({ type: 'question', question: 'q' })).toBe('refining')
  })
})

describe('planAnswerRun', () => {
  it('returns null when no run asked a question', () => {
    expect(planAnswerRun([], 'a')).toBeNull()
    expect(planAnswerRun([run({ output: REFINEMENT })], 'a')).toBeNull()
  })

  it('starts the Q&A history with the latest question', () => {
    const questionRun = run({ id: 'q1', output: { type: 'question', question: 'Welche DB?' } })
    const plan = planAnswerRun([questionRun], 'Postgres')
    expect(plan?.questionRun.id).toBe('q1')
    expect(plan?.previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
  })

  it('appends to the history of the latest answer run', () => {
    const runs = [
      run({ id: 'r1', iteration: 1, output: { type: 'question', question: 'Q1' } }),
      run({
        id: 'r2', iteration: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
        input: {
          ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'repo', model: 'm',
          previousRuns: [{ question: 'Q1', answer: 'A1' }],
        },
      }),
    ]
    const plan = planAnswerRun(runs, 'A2')
    expect(plan?.questionRun.id).toBe('r2')
    expect(plan?.previousRuns).toEqual([
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ])
  })
})
