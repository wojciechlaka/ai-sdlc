import { describe, it, expect } from 'vitest'
import type { AgentRun, Ticket } from './types'
import { errorCodeOf } from '../testing/fakes'
import {
  canAnswer,
  canStartStage,
  canStop,
  choiceAnswerText,
  countQuestionsAsked,
  currentArtifactStage,
  isStageCompleted,
  nextStage,
  planAnswerRun,
  QUESTION_LIMIT,
  questionLimit,
  questionsRemaining,
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
    input: { model: 'm', answeredQuestions: [] }, output: null, status: 'succeeded', model: 'm',
    costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null,
    startedAt: NOW, finishedAt: NOW, ...patch,
  }
}

const CHOICE_OUTPUT = {
  type: 'choice' as const, question: 'Wo?', recommended: 'A' as const,
  options: [
    { id: 'A' as const, title: 'Speichern', description: 'd', pros: [], cons: [] },
    { id: 'B' as const, title: 'Lesen', description: 'd', pros: [], cons: [] },
  ],
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

  it('allows design from ready and failed, never done', () => {
    expect(canStartStage(ticket({ stage: 'design', state: 'ready' }))).toBe(true)
    expect(canStartStage(ticket({ stage: 'design', state: 'failed' }))).toBe(true)
    expect(canStartStage(ticket({ stage: 'design', state: 'in_review' }))).toBe(false)
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

  it('derives the stage from the files on the base branch', () => {
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
    expect(planAnswerRun([run({ output: null })], { answer: 'a' })).toBeNull()
  })

  it('appends the answer to the history of the question run', () => {
    const first = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const second = run({
      id: 'r2', seq: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
      input: { model: 'm', answeredQuestions: [{ question: 'Q1', answer: 'A1' }] },
    })
    const plan = planAnswerRun([first, second], { answer: 'A2' })
    expect(plan?.questionRun.id).toBe('r2')
    expect(plan?.answeredQuestions).toEqual([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }])
    expect(plan?.answer).toBe('A2')
    expect(plan?.choice).toBeUndefined()
  })

  it('ignores a question that was followed by a later run', () => {
    const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const failed = run({ id: 'r2', seq: 2, output: null, status: 'failed' })
    expect(planAnswerRun([asked, failed], { answer: 'a' })).toBeNull()
  })

  it('turns a picked option into the answer text of the history', () => {
    const offered = run({ id: 'r1', seq: 1, stage: 'design', output: CHOICE_OUTPUT })
    const plan = planAnswerRun([offered], { choice: 'B', note: 'ohne Cache' })
    expect(plan?.answeredQuestions).toEqual([{ question: 'Wo?', answer: 'Ansatz B: Lesen — Anmerkung: ohne Cache' }])
    expect(plan?.choice).toBe('B')
  })

  it('rejects input that does not fit the open question', () => {
    const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const offered = run({ id: 'r1', seq: 1, stage: 'design', output: CHOICE_OUTPUT })
    expect(() => planAnswerRun([asked], { choice: 'A' })).toThrow('erwartet eine Antwort, keine Auswahl')
    expect(() => planAnswerRun([offered], { answer: 'Lesen' })).toThrow('Bitte einen der angebotenen Ansätze wählen')
    expect(() => planAnswerRun([offered], { choice: 'C' })).toThrow('Ansatz C wurde nicht angeboten')
    expect(errorCodeOf(() => planAnswerRun([offered], { choice: 'C' }))).toBe('VALIDATION')
  })
})

describe('question limit', () => {
  it('limits only the design stage', () => {
    expect(QUESTION_LIMIT).toBe(3)
    expect(questionLimit('design')).toBe(3)
    expect(questionLimit('plan')).toBeNull()
  })

  it('counts questions and choices since the latest start', () => {
    const runs = [
      run({ id: 'r1', seq: 1, stage: 'design', output: { type: 'question', question: 'Q0' } }),
      run({ id: 'r2', seq: 2, stage: 'design', output: null, status: 'failed' }),
      run({ id: 'r3', seq: 3, stage: 'design', output: { type: 'question', question: 'Q1' } }),
      run({ id: 'r4', seq: 4, stage: 'design', trigger: 'answer', output: CHOICE_OUTPUT }),
      run({ id: 'r5', seq: 5, stage: 'design', trigger: 'answer', output: null, status: 'running' }),
    ]
    expect(countQuestionsAsked(runs)).toBe(2)
    expect(countQuestionsAsked(runs.slice(0, 1))).toBe(1)
    expect(countQuestionsAsked([])).toBe(0)
  })

  it('counts from 0 after a new start', () => {
    const runs = [
      run({ id: 'r1', seq: 1, stage: 'design', output: { type: 'question', question: 'Q1' } }),
      run({ id: 'r2', seq: 2, stage: 'design', trigger: 'answer', output: CHOICE_OUTPUT }),
      run({ id: 'r3', seq: 3, stage: 'design', output: null, status: 'running' }),
    ]
    expect(countQuestionsAsked(runs)).toBe(0)
  })

  it('reports the remaining questions, never below 0', () => {
    const asked = (n: number) => Array.from({ length: n }, (_, i) =>
      run({ id: `r${i}`, seq: i + 1, stage: 'design', trigger: i === 0 ? 'initial' : 'answer', output: { type: 'question', question: `Q${i}` } }))
    expect(questionsRemaining('design', [])).toBe(3)
    expect(questionsRemaining('design', asked(2))).toBe(1)
    expect(questionsRemaining('design', asked(4))).toBe(0)
    expect(questionsRemaining('plan', asked(4))).toBeNull()
  })
})

describe('choiceAnswerText', () => {
  it('names the option and adds the note only when given', () => {
    expect(choiceAnswerText({ id: 'B', title: 'Beim Lesen berechnen' })).toBe('Ansatz B: Beim Lesen berechnen')
    expect(choiceAnswerText({ id: 'B', title: 'Beim Lesen berechnen' }, ' ohne Cache ')).toBe('Ansatz B: Beim Lesen berechnen — Anmerkung: ohne Cache')
    expect(choiceAnswerText({ id: 'A', title: 'Speichern' }, '   ')).toBe('Ansatz A: Speichern')
  })
})
