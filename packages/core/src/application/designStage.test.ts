import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import {
  SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, errorCodeOf, seedTicket, type TestContext,
} from '../testing/fakes'
import { answerQuestion, startStage, stopRun } from './stageCommands'
import { syncReviews } from './syncReviews'

// Stage 2 (Design) end to end with fakes: start, choice, spec PR, merge → done, stop.

const MODEL = { model: 'claude-sonnet-4-6' }
const INTENT_PATH = 'docs/work/CB-2/intent.md'
const INTENT_MD = '# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien\n\n- Leser sehen die Lesezeit.\n'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** CB-2 in stage design with its merged intent on the base branch; the agent returns the sample spec. */
function setup(): TestContext {
  const ctx = createTestContext()
  seedTicket(ctx, 'CB-2', { title: 'Lesezeit bei Artikeln anzeigen', stage: 'design' })
  ctx.codeHost.files.set(INTENT_PATH, INTENT_MD)
  ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }
  return ctx
}

async function start(ctx: TestContext) {
  startStage(ctx.deps, 'CB-2', MODEL)
  await ctx.settle()
  return ctx.deps.tickets.findByKey('CB-2')!
}

describe('design stage — spec', () => {
  it('writes the spec on its own branch, opens the PR and waits for review', async () => {
    const ctx = setup()

    expect(await start(ctx)).toMatchObject({ stage: 'design', state: 'in_review' })

    const file = ctx.codeHost.branches.get('CB-2/spec')?.get('docs/work/CB-2/spec.md')
    expect(file).toContain('ticket: CB-2\nstage: design\nsource: examples/tickets/cb-2.md\nintent: docs/work/CB-2/intent.md\n')
    expect(file).toContain('# CB-2: Lesezeit in der Artikel-API')
    expect(ctx.codeHost.pulls[0]).toMatchObject({ headBranch: 'CB-2/spec', title: 'CB-2: Spec', state: 'open' })
    expect(ctx.codeHost.pulls[0]?.body).toContain('Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.')
    expect(ctx.deps.artifacts.findOpen('CB-2', 'design')).toMatchObject({ branch: 'CB-2/spec', path: 'docs/work/CB-2/spec.md' })
    expect(ctx.agent.calls[0]).toMatchObject({ stage: 'design', model: 'claude-sonnet-4-6' })
    expect(ctx.store.audit[0]?.payload).toMatchObject({ stage: 'design', trigger: 'initial' })
  })

  it('moves the ticket to done once the spec PR is merged', async () => {
    const ctx = setup()
    await start(ctx)
    ctx.codeHost.merge(ctx.deps.artifacts.findOpen('CB-2', 'design')!.prNumber)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-2')).toMatchObject({ stage: 'done', state: 'ready' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'stage_changed', payload: { from: 'design', to: 'done' } })
    expect(ctx.codeHost.files.has('docs/work/CB-2/spec.md')).toBe(true)
  })
})

describe('design stage — intent', () => {
  it('passes the merged intent from the base branch to the agent', async () => {
    const ctx = setup()
    await start(ctx)
    expect(ctx.agent.calls[0]?.intent).toBe(INTENT_MD)
    expect(ctx.codeHost.calls).toContain('readFile')
  })

  it('fails without intent on the base branch and does not start the agent', async () => {
    const ctx = setup()
    ctx.codeHost.files.delete(INTENT_PATH)

    expect(await start(ctx)).toMatchObject({ stage: 'design', state: 'failed' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', payload: { message: 'Intent fehlt auf showcase — erst Stufe 1 abschließen' } })
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.agent.calls).toEqual([])
    expect(ctx.repos.requestedUrls).toEqual([])
  })

  it('fails with the GitHub message when the intent cannot be read', async () => {
    const ctx = setup()
    ctx.codeHost.failures.readFile = new CodeHostError(0, 'GitHub ist nicht erreichbar')

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)?.payload).toEqual({ message: 'GitHub ist nicht erreichbar' })
  })

  it('stop during the intent read ends the run without starting the agent', async () => {
    const ctx = setup()
    let openGate!: () => void
    const gate = new Promise<void>((resolve) => { openGate = resolve })
    const original = ctx.codeHost.readFile.bind(ctx.codeHost)
    let reached = false
    ctx.codeHost.readFile = async (...args) => {
      reached = true
      await gate
      return original(...args)
    }
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(reached).toBe(true))
    stopRun(ctx.deps, 'CB-2')
    openGate()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.agent.calls).toEqual([])
    expect(ctx.repos.requestedUrls).toEqual([])
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.store.audit.some((e) => e.type === 'error')).toBe(false)
  })

  it('does not read an intent in the plan stage', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-3')
    startStage(ctx.deps, 'CB-3', MODEL)
    await ctx.settle()
    expect(ctx.agent.calls[0]?.intent).toBeUndefined()
    expect(ctx.codeHost.calls).not.toContain('readFile')
  })
})

describe('design stage — choice', () => {
  it('offers the approaches, logs them and waits for the pick', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }

    expect(await start(ctx)).toMatchObject({ state: 'awaiting_answer' })
    expect(ctx.store.audit.at(-1)).toMatchObject({
      type: 'choice_offered',
      actor: 'agent',
      payload: {
        question: 'Wo wird die Lesezeit berechnet?',
        options: [{ id: 'A', title: 'Beim Speichern' }, { id: 'B', title: 'Beim Lesen' }],
        recommended: 'B',
      },
    })
    expect(ctx.events.published).toContainEqual({ type: 'question', ticketKey: 'CB-2', question: 'Wo wird die Lesezeit berechnet?' })
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('continues with the picked option and documents it in the spec', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
    await start(ctx)
    ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }

    answerQuestion(ctx.deps, 'CB-2', { choice: 'A', note: 'Migration ist ok' })
    await ctx.settle()

    const answer = 'Ansatz A: Beim Speichern — Anmerkung: Migration ist ok'
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.agent.calls[1]).toMatchObject({ answeredQuestions: [{ question: 'Wo wird die Lesezeit berechnet?', answer }], questionsRemaining: 2 })
    expect(ctx.store.audit.find((e) => e.type === 'answer_given')).toMatchObject({ actor: 'human', payload: { answer, choice: 'A' } })
    expect(ctx.codeHost.branches.get('CB-2/spec')?.get('docs/work/CB-2/spec.md')).toContain(`**F:** Wo wird die Lesezeit berechnet?\\\n**A:** ${answer}`)
  })

  it('rejects an option that was not offered and a free-text answer to a choice', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
    await start(ctx)

    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { choice: 'C' }))).toBe('VALIDATION')
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'Beim Lesen' }))).toBe('VALIDATION')
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { choice: 'X' }))).toBe('VALIDATION')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('awaiting_answer')
    expect(ctx.store.audit.map((e) => e.type)).not.toContain('answer_given')
  })
})

describe('design stage — question limit', () => {
  const QUESTION = { output: { type: 'question' as const, question: 'Gilt das auch für Entwürfe?' }, meta: SAMPLE_META }

  async function answer(ctx: TestContext, text: string): Promise<void> {
    answerQuestion(ctx.deps, 'CB-2', { answer: text })
    await ctx.settle()
  }

  it('tells the agent how many questions are left and fails when it asks after the third', async () => {
    const ctx = setup()
    ctx.agent.outcome = QUESTION
    await start(ctx)
    await answer(ctx, 'A1')
    await answer(ctx, 'A2')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('awaiting_answer')

    await answer(ctx, 'A3')

    expect(ctx.agent.calls.map((call) => call.questionsRemaining)).toEqual([3, 2, 1, 0])
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('failed')
    expect(ctx.store.audit.at(-1)).toMatchObject({
      type: 'error', payload: { message: 'Rückfragen-Grenze erreicht — der Agent hat keine Spec geliefert' },
    })
    expect(ctx.store.audit.filter((e) => e.type === 'question_asked')).toHaveLength(3)
  })

  it('starts again with the full budget after a stop', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
    await start(ctx)
    stopRun(ctx.deps, 'CB-2')
    ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }

    expect(await start(ctx)).toMatchObject({ state: 'in_review' })
    expect(ctx.agent.calls.map((call) => call.questionsRemaining)).toEqual([3, 3])
  })

  it('gives the plan agent no limit', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-3')
    ctx.agent.outcome = QUESTION
    startStage(ctx.deps, 'CB-3', MODEL)
    await ctx.settle()
    for (const text of ['A1', 'A2', 'A3', 'A4']) {
      answerQuestion(ctx.deps, 'CB-3', { answer: text })
      await ctx.settle()
    }
    expect(ctx.deps.tickets.findByKey('CB-3')?.state).toBe('awaiting_answer')
    expect(ctx.agent.calls.every((call) => call.questionsRemaining === undefined)).toBe(true)
  })
})

describe('design stage — stop', () => {
  it('stops a running design agent and returns the ticket to ready', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))

    stopRun(ctx.deps, 'CB-2')
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.store.runs[0]).toMatchObject({ stage: 'design', status: 'failed' })
    expect(ctx.codeHost.pulls).toEqual([])
  })
})
