import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { startStage } from './stageCommands'
import { syncReviews } from './syncReviews'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Runs stage 1 for the ticket, so it ends `in_review` with an open PR. */
async function inReview(ctx: TestContext, key: string): Promise<number> {
  seedTicket(ctx, key)
  startStage(ctx.deps, key, { model: 'm' })
  await ctx.settle()
  return ctx.deps.artifacts.findOpen(key, 'plan')!.prNumber
}

describe('syncReviews', () => {
  it('moves a merged intent to stage design', async () => {
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    const mergedAt = new Date('2026-10-28T12:00:00Z')
    ctx.codeHost.merge(pr, mergedAt)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.deps.artifacts.listForTicket('CB-1')[0]).toMatchObject({ prState: 'merged', mergedAt })
    expect(ctx.store.audit.slice(-2)).toMatchObject([
      { type: 'pr_merged', actor: 'human', payload: { prNumber: pr } },
      { type: 'stage_changed', actor: 'system', payload: { from: 'plan', to: 'design' } },
    ])
    expect(ctx.events.published.at(-1)).toEqual({ type: 'state', ticketKey: 'CB-1', stage: 'design', state: 'ready' })
  })

  it('returns a PR closed without merge to ready and deletes its branch', async () => {
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    ctx.codeHost.pulls[0]!.state = 'closed'

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'plan', state: 'ready' })
    expect(ctx.codeHost.branches.has('CB-1/intent')).toBe(false)
    expect(ctx.deps.artifacts.findOpen('CB-1', 'plan')).toBeNull()
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'pr_closed', payload: { prNumber: pr } })
  })

  it('leaves open PRs untouched', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
  })

  it('keeps the state on GitHub errors and retries next time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    ctx.codeHost.failures.getPullRequest = new CodeHostError(0, 'offline')

    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
    expect(warn).toHaveBeenCalled()

    delete ctx.codeHost.failures.getPullRequest
    ctx.codeHost.merge(pr)
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.stage).toBe('design')
  })

  it('returns to ready when the PR no longer exists', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    ctx.codeHost.pulls.splice(0)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(ctx.deps.artifacts.findOpen('CB-1', 'plan')).toBeNull()
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', payload: { message: 'PR #1 gibt es nicht mehr' } })
  })

  it('checks only the given ticket', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    await inReview(ctx, 'CB-2')
    ctx.codeHost.calls.length = 0

    await syncReviews(ctx.deps, 'cb-2')

    expect(ctx.codeHost.calls).toEqual(['getPullRequest'])
  })

  it('does nothing without token', async () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
  })
})
