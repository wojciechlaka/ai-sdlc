import { describe, it, expect, vi, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { getSettings, getTicket, listTickets } from './queries'

afterEach(() => {
  vi.restoreAllMocks()
})

function openIntentPr(ctx: TestContext, key: string, prNumber: number) {
  return ctx.deps.artifacts.create({
    ticketKey: key, stage: 'plan', path: `docs/work/${key}/intent.md`, branch: `${key}/intent`,
    prNumber, prUrl: `https://github.com/o/r/pull/${prNumber}`,
  })
}

describe('listTickets', () => {
  it('lists tickets by key with the open PR of the current stage', () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-10')
    seedTicket(ctx, 'CB-2', { state: 'in_review' })
    openIntentPr(ctx, 'CB-2', 4)

    const tickets = listTickets(ctx.deps)

    expect(tickets.map((t) => t.key)).toEqual(['CB-2', 'CB-10'])
    expect(tickets[0]).toMatchObject({ state: 'in_review', openPr: { number: 4, url: 'https://github.com/o/r/pull/4', state: 'open' } })
    expect(tickets[1]?.openPr).toBeNull()
  })
})

describe('getTicket', () => {
  it('shows both stages; open stages have no content and need no GitHub call', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')

    const detail = await getTicket(ctx.deps, 'CB-1')

    expect(detail.stages).toEqual([
      {
        stage: 'plan', path: 'docs/work/CB-1/intent.md',
        fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-1/intent.md',
        completed: false, pr: null, mergedAt: null, content: null,
      },
      {
        stage: 'design', path: 'docs/work/CB-1/spec.md',
        fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-1/spec.md',
        completed: false, pr: null, mergedAt: null, content: null,
      },
    ])
    expect(ctx.codeHost.calls).toEqual([])
  })

  it('reads the content of completed stages live from the default branch', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { stage: 'design' })
    const artifact = openIntentPr(ctx, 'CB-1', 1)
    const mergedAt = new Date('2026-10-28T12:00:00Z')
    ctx.deps.artifacts.markMerged(artifact.id, mergedAt)
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', '# CB-1: Intent')

    const [plan, design] = (await getTicket(ctx.deps, 'CB-1')).stages

    expect(plan).toMatchObject({ completed: true, content: '# CB-1: Intent', mergedAt, pr: { number: 1, state: 'merged' } })
    expect(design).toMatchObject({ completed: false, content: null, pr: null })
  })

  it('shows no content without token or when GitHub fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noToken = createTestContext({ token: false })
    seedTicket(noToken, 'CB-1', { stage: 'design' })
    expect((await getTicket(noToken.deps, 'CB-1')).stages[0]?.content).toBeNull()

    const failing = createTestContext()
    seedTicket(failing, 'CB-1', { stage: 'design' })
    failing.codeHost.failures.readFile = new CodeHostError(0, 'offline')
    expect((await getTicket(failing.deps, 'CB-1')).stages[0]?.content).toBeNull()
  })

  it('returns the log and the open question', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { state: 'awaiting_answer' })
    const run = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'plan', trigger: 'initial', model: 'm', input: { model: 'm', previousRuns: [] } })
    ctx.deps.runs.complete(run.id, {
      output: { type: 'question', question: 'Wer?' }, costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
    ctx.deps.audit.append({ ticketKey: 'CB-1', actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' } })

    const detail = await getTicket(ctx.deps, 'CB-1')

    expect(detail.pendingQuestion).toBe('Wer?')
    expect(detail.log).toEqual([{ actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' }, createdAt: expect.any(Date) }])
  })

  it('has no open question outside awaiting_answer', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')
    expect((await getTicket(ctx.deps, 'CB-1')).pendingQuestion).toBeNull()
  })

  it('accepts lower-case keys and reports unknown ones', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')
    expect((await getTicket(ctx.deps, 'cb-1')).key).toBe('CB-1')
    await expect(getTicket(ctx.deps, 'CB-404')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('getSettings', () => {
  it('reports the target repository and whether a token is configured', () => {
    expect(getSettings(createTestContext().deps)).toEqual({ repoUrl: 'https://github.com/o/r', tokenConfigured: true })
    expect(getSettings(createTestContext({ token: false }).deps).tokenConfigured).toBe(false)
  })
})
