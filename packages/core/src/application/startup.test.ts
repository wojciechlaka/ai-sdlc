import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, sourceTicket, type TestContext } from '../testing/fakes'
import { resetSystem, startup } from './startup'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function withSource(ctx: TestContext, ...keys: string[]): TestContext {
  ctx.source.tickets = keys.map((key) => sourceTicket(key))
  return ctx
}

describe('startup — tickets', () => {
  it('imports the tickets of the source as plan/ready and logs the import', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    await startup(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([['CB-1', 'plan', 'ready'], ['CB-2', 'plan', 'ready']])
    expect(ctx.store.audit).toMatchObject([
      { ticketKey: 'CB-1', type: 'ticket_imported', payload: { sourcePath: 'examples/tickets/cb-1.md' } },
      { ticketKey: 'CB-2', type: 'ticket_imported' },
    ])
  })

  it('updates the text of known tickets but keeps stage and state (no token)', async () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1', { stage: 'design', state: 'failed' })
    ctx.source.tickets = [sourceTicket('CB-1', { title: 'Neuer Titel' })]
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ title: 'Neuer Titel', stage: 'design', state: 'failed' })
    expect(ctx.store.audit).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN'))
  })

  it('ends runs interrupted by a restart and returns their tickets to ready', async () => {
    const ctx = withSource(createTestContext({ token: false }), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'running' })
    const run = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'plan', trigger: 'initial', model: 'm', input: { model: 'm', previousRuns: [] } })

    await startup(ctx.deps)

    expect(ctx.deps.runs.findById(run.id)?.status).toBe('failed')
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(ctx.store.audit[0]).toMatchObject({ type: 'run_finished', payload: { runId: run.id, status: 'failed', reason: 'Neustart' } })
  })
})

describe('startup — GitHub', () => {
  it('closes the open PRs of the app and deletes their branches; other PRs stay', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    const appPr = ctx.codeHost.seedPullRequest('CB-1/intent')
    const foreignPr = ctx.codeHost.seedPullRequest('feature/x')
    const unknownTicketPr = ctx.codeHost.seedPullRequest('CB-9/intent')

    await startup(ctx.deps)

    expect(appPr.state).toBe('closed')
    expect(ctx.codeHost.branches.has('CB-1/intent')).toBe(false)
    expect(foreignPr.state).toBe('open')
    expect(unknownTicketPr.state).toBe('open')
    expect(ctx.store.audit.at(-1)).toMatchObject({ ticketKey: 'CB-1', type: 'cleanup', payload: { prNumber: appPr.number, branch: 'CB-1/intent' } })
  })

  it('derives the stage from the files on the default branch', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2', 'CB-3')
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', 'x')
    ctx.codeHost.files.set('docs/work/CB-2/intent.md', 'x')
    ctx.codeHost.files.set('docs/work/CB-2/spec.md', 'x')

    await startup(ctx.deps)

    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([
      ['CB-1', 'design', 'ready'], ['CB-2', 'done', 'ready'], ['CB-3', 'plan', 'ready'],
    ])
    expect(ctx.store.audit.filter((e) => e.type === 'stage_changed')).toHaveLength(2)
  })

  it('applies a merge that happened while the app was down', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    await ctx.codeHost.createBranch('CB-1/intent')
    await ctx.codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    const pr = await ctx.codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: '' })
    ctx.deps.artifacts.create({ ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent', prNumber: pr.number, prUrl: pr.url })
    ctx.codeHost.merge(pr.number)

    await startup(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.deps.artifacts.listForTicket('CB-1')[0]?.prState).toBe('merged')
  })

  it('keeps an open question across the restart', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'awaiting_answer' })
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('awaiting_answer')
  })

  it('continues with the database state when GitHub fails', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.failures.listOpenPullRequests = new CodeHostError(0, 'offline')
    await expect(startup(ctx.deps)).resolves.toBeUndefined()
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'))
  })
})

describe('resetSystem', () => {
  it('stops running agents, empties the database and starts again', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    seedTicket(ctx, 'CB-1', { stage: 'design', state: 'running' })
    ctx.deps.audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'cleanup' })

    await resetSystem(ctx.deps)

    expect(ctx.agent.stopped).toEqual(['CB-1'])
    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([['CB-1', 'plan', 'ready'], ['CB-2', 'plan', 'ready']])
    expect(ctx.store.audit.map((e) => e.type)).toEqual(['ticket_imported', 'ticket_imported'])
  })

  it('picks up a new ticket file', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    await startup(ctx.deps)
    ctx.source.tickets.push(sourceTicket('CB-4'))
    await resetSystem(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => t.key)).toEqual(['CB-1', 'CB-4'])
  })
})
