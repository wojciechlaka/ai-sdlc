import { describe, it, expect } from 'vitest'
import type { AgentRun, Ticket } from './types'
import {
  canAnswer,
  canStartStage,
  canStop,
  currentArtifactStage,
  isStageCompleted,
  nextStage,
  planAnswerRun,
  reconcile,
  stageFromRepo,
} from './rules'

const NOW = new Date('2026-10-28T10:00:00Z')

function ticket(patch: Partial<Ticket> = {}): Ticket {
  return {
    key: 'CB-1', title: 'T', description: 'D', priority: null, sourcePath: 'examples/tickets/cb-1.md',
    stage: 'plan', state: 'ready', createdAt: NOW, updatedAt: NOW, ...patch,
  }
}

function run(patch: Partial<AgentRun>): AgentRun {
  return {
    id: 'r', ticketKey: 'CB-1', stage: 'plan', seq: 1, trigger: 'initial',
    input: { model: 'm', previousRuns: [] }, output: null, status: 'succeeded', model: 'm',
    costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null,
    startedAt: NOW, finishedAt: NOW, ...patch,
  }
}

describe('canStartStage', () => {
  it('allows plan from ready and failed', () => {
    expect(canStartStage(ticket({ state: 'ready' }))).toBe(true)
    expect(canStartStage(ticket({ state: 'failed' }))).toBe(true)
  })

  it('rejects every other state', () => {
    for (const state of ['running', 'awaiting_answer', 'in_review'] as const) {
      expect(canStartStage(ticket({ state }))).toBe(false)
    }
  })

  it('rejects design until part B and done always', () => {
    expect(canStartStage(ticket({ stage: 'design' }))).toBe(false)
    expect(canStartStage(ticket({ stage: 'done' }))).toBe(false)
  })
})

describe('canAnswer / canStop', () => {
  it('answers only while awaiting an answer', () => {
    expect(canAnswer(ticket({ state: 'awaiting_answer' }))).toBe(true)
    expect(canAnswer(ticket({ state: 'running' }))).toBe(false)
  })

  it('stops running and waiting tickets', () => {
    expect(canStop(ticket({ state: 'running' }))).toBe(true)
    expect(canStop(ticket({ state: 'awaiting_answer' }))).toBe(true)
    expect(canStop(ticket({ state: 'in_review' }))).toBe(false)
    expect(canStop(ticket({ state: 'ready' }))).toBe(false)
    expect(canStop(ticket({ state: 'failed' }))).toBe(false)
  })
})

describe('stages', () => {
  it('maps the current stage to its artifact stage', () => {
    expect(currentArtifactStage(ticket({ stage: 'plan' }))).toBe('plan')
    expect(currentArtifactStage(ticket({ stage: 'done' }))).toBeNull()
  })

  it('moves plan → design → done', () => {
    expect(nextStage('plan')).toBe('design')
    expect(nextStage('design')).toBe('done')
  })

  it('knows which stages are completed', () => {
    expect(isStageCompleted(ticket({ stage: 'plan' }), 'plan')).toBe(false)
    expect(isStageCompleted(ticket({ stage: 'design' }), 'plan')).toBe(true)
    expect(isStageCompleted(ticket({ stage: 'design' }), 'design')).toBe(false)
    expect(isStageCompleted(ticket({ stage: 'done' }), 'design')).toBe(true)
  })

  it('derives the stage from the files on the default branch', () => {
    expect(stageFromRepo({ hasIntent: false, hasSpec: false })).toBe('plan')
    expect(stageFromRepo({ hasIntent: true, hasSpec: false })).toBe('design')
    expect(stageFromRepo({ hasIntent: true, hasSpec: true })).toBe('done')
  })
})

describe('reconcile', () => {
  it('resets to ready when the repo shows another stage', () => {
    expect(reconcile(ticket({ stage: 'plan', state: 'failed' }), 'design')).toEqual({ stage: 'design', state: 'ready' })
  })

  it('turns in_review into ready because the start-up closed all app PRs', () => {
    expect(reconcile(ticket({ state: 'in_review' }), 'plan')).toEqual({ stage: 'plan', state: 'ready' })
  })

  it('keeps running and failed when the stage is unchanged', () => {
    expect(reconcile(ticket({ state: 'running' }), 'plan')).toEqual({ stage: 'plan', state: 'running' })
    expect(reconcile(ticket({ state: 'failed' }), 'plan')).toEqual({ stage: 'plan', state: 'failed' })
  })

  it('keeps a pending question across restarts', () => {
    expect(reconcile(ticket({ state: 'awaiting_answer' }), 'plan')).toEqual({ stage: 'plan', state: 'awaiting_answer' })
  })
})

describe('planAnswerRun', () => {
  it('returns null without a question', () => {
    expect(planAnswerRun([run({ output: null })], 'a')).toBeNull()
  })

  it('appends the answer to the history of the question run', () => {
    const first = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const second = run({
      id: 'r2', seq: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
      input: { model: 'm', previousRuns: [{ question: 'Q1', answer: 'A1' }] },
    })
    const plan = planAnswerRun([first, second], 'A2')
    expect(plan?.questionRun.id).toBe('r2')
    expect(plan?.previousRuns).toEqual([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }])
  })

  it('ignores a question that was followed by a later run', () => {
    const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const failed = run({ id: 'r2', seq: 2, output: null, status: 'failed' })
    expect(planAnswerRun([asked, failed], 'a')).toBeNull()
  })
})
