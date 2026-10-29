import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { startStage, stopRun } from './stageCommands'
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
