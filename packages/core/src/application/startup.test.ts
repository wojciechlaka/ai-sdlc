import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, errorCodeOf, seedTicket, sourceTicket, type TestContext } from '../testing/fakes'
import { answerQuestion, startStage } from './stageCommands'
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

  it('reports the missing token as warning', async () => {
    const ctx = withSource(createTestContext({ token: false }), 'CB-1')
    expect((await startup(ctx.deps)).warnings).toEqual([expect.stringContaining('GITHUB_TOKEN fehlt')])
  })

  it('ends runs interrupted by a restart and returns their tickets to ready', async () => {
    const ctx = withSource(createTestContext({ token: false }), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'running' })
    const run = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'plan', trigger: 'initial', model: 'm', input: { model: 'm', answeredQuestions: [] } })

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

  it('derives the stage from the files on the base branch', async () => {
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
    expect((await startup(ctx.deps)).warnings).toEqual([expect.stringContaining('offline')])
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'))
  })

  it('prepares the base branch on every start with token, before anything else on GitHub', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.baseBranchExists = false
    await startup(ctx.deps)
    await startup(ctx.deps)
    expect(ctx.codeHost.calls.filter((c) => c === 'prepareBaseBranch')).toHaveLength(2)
    expect(ctx.codeHost.calls[0]).toBe('prepareBaseBranch')
    expect(ctx.codeHost.baselineFiles).not.toBeNull()

    const noToken = withSource(createTestContext({ token: false }), 'CB-1')
    await startup(noToken.deps)
    expect(noToken.codeHost.calls).toEqual([])
  })

  it('leaves the base branch alone without resetRepo', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', 'x')
    ctx.codeHost.branches.set('CB-1/intent', new Map())

    expect(await startup(ctx.deps)).toEqual({ warnings: [] })

    expect(ctx.codeHost.calls).not.toContain('resetBaseBranch')
    expect(ctx.codeHost.files.get('docs/work/CB-1/intent.md')).toBe('x')
    expect(ctx.codeHost.branches.has('CB-1/intent')).toBe(true)
    expect(ctx.deps.tickets.findByKey('CB-1')?.stage).toBe('design')
  })
})

describe('startup — isolation', () => {
  it('derives the other ticket when readFile fails for one', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    ctx.codeHost.files.set('docs/work/CB-2/intent.md', 'x')
    const read = ctx.codeHost.readFile.bind(ctx.codeHost)
    ctx.codeHost.readFile = async (path: string) => {
      if (path.includes('CB-1')) throw new CodeHostError(500, 'boom')
      return read(path)
    }
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-2')?.stage).toBe('design')
    expect(ctx.deps.tickets.findByKey('CB-1')?.stage).toBe('plan')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CB-1'))
  })

  it('collects every caught GitHub problem as warning', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    ctx.codeHost.seedPullRequest('CB-1/intent')
    ctx.codeHost.failures.closePullRequest = new CodeHostError(500, 'kaputt')
    ctx.codeHost.failures.readFile = new CodeHostError(500, 'unlesbar')

    const { warnings } = await startup(ctx.deps)

    expect(warnings).toEqual([
      expect.stringMatching(/PR #1 .*kaputt/),
      expect.stringMatching(/CB-1.*unlesbar/),
      expect.stringMatching(/CB-2.*unlesbar/),
    ])
  })

  it('still closes the other app PR when closing one fails', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    const pr1 = ctx.codeHost.seedPullRequest('CB-1/intent')
    const pr2 = ctx.codeHost.seedPullRequest('CB-2/intent')
    const close = ctx.codeHost.closePullRequest.bind(ctx.codeHost)
    ctx.codeHost.closePullRequest = async (n: number) => {
      if (n === pr1.number) throw new CodeHostError(500, 'boom')
      return close(n)
    }
    await startup(ctx.deps)
    expect(pr1.state).toBe('open')
    expect(pr2.state).toBe('closed')
  })

  it('skips a ticket that became running while GitHub was read', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', 'x')
    const read = ctx.codeHost.readFile.bind(ctx.codeHost)
    ctx.codeHost.readFile = async (path: string) => {
      ctx.deps.tickets.update('CB-1', { state: 'running' })
      return read(path)
    }
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'plan', state: 'running' })
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

  it('resets the repo: merged artifacts on the base branch are gone, all tickets back in plan', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    ctx.codeHost.baselineFiles = new Map([['README.md', 'base']])
    const merged = ctx.codeHost.seedPullRequest('CB-1/intent')
    await ctx.codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    ctx.codeHost.merge(merged.number)
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.stage).toBe('design')

    const report = await resetSystem(ctx.deps)

    expect(report).toEqual({ warnings: [] })
    expect(ctx.codeHost.files.has('docs/work/CB-1/intent.md')).toBe(false)
    expect(ctx.codeHost.files.get('README.md')).toBe('base')
    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([['CB-1', 'plan', 'ready'], ['CB-2', 'plan', 'ready']])
    expect(ctx.codeHost.calls.filter((c) => c === 'resetBaseBranch')).toHaveLength(1)
  })

  it('deletes leftover app branches without PR, closes open app PRs and keeps foreign branches', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    ctx.codeHost.branches.set('CB-1/intent', new Map([['a', 'b']]))
    ctx.codeHost.branches.set('CB-1/spec', new Map())
    ctx.codeHost.branches.set('feature/x', new Map())
    ctx.codeHost.branches.set('CB-9/intent', new Map())
    const open = ctx.codeHost.seedPullRequest('CB-2/intent')

    await resetSystem(ctx.deps)

    expect([...ctx.codeHost.branches.keys()]).toEqual(['feature/x', 'CB-9/intent'])
    expect(open.state).toBe('closed')
    expect(ctx.store.audit.filter((e) => e.type === 'cleanup')).toMatchObject([{ ticketKey: 'CB-2', payload: { prNumber: open.number } }])
  })

  it('resets after closing the PRs', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    const pr = ctx.codeHost.seedPullRequest('CB-1/intent')
    ctx.deps.artifacts.create({ ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent', prNumber: pr.number, prUrl: pr.url })

    await startup(ctx.deps, { resetRepo: true })

    expect(pr.state).toBe('closed')
    expect(ctx.codeHost.calls.indexOf('resetBaseBranch')).toBeGreaterThan(ctx.codeHost.calls.indexOf('closePullRequest'))
  })

  it('settles merged PRs before the reset, so no artifact stays open', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    const pr = ctx.codeHost.seedPullRequest('CB-1/intent')
    ctx.deps.artifacts.create({ ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent', prNumber: pr.number, prUrl: pr.url })
    ctx.codeHost.merge(pr.number)

    await startup(ctx.deps, { resetRepo: true })

    expect(ctx.deps.artifacts.findOpen('CB-1', 'plan')).toBeNull()
    expect(ctx.deps.artifacts.listForTicket('CB-1')[0]?.prState).toBe('merged')
    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'plan', state: 'ready' })
  })

  it('warns when a new baseline already contains docs/work', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.defaultBranchFiles.set('docs/work/CB-1/intent.md', 'x')
    ctx.codeHost.baseBranchExists = false
    const { warnings } = await startup(ctx.deps)
    expect(warnings).toEqual(['Ausgangsstand showcase-base enthält bereits docs/work — diese Tickets starten nicht in Stufe 1'])
  })

  it('blocks starting and answering while the reset runs', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const prepare = ctx.codeHost.prepareBaseBranch.bind(ctx.codeHost)
    ctx.codeHost.prepareBaseBranch = async () => {
      await gate
      return prepare()
    }

    const reset = resetSystem(ctx.deps)
    await Promise.resolve()
    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-1', { model: 'm' }))).toBe('CONFLICT')
    expect(() => answerQuestion(ctx.deps, 'CB-1', { answer: 'a' })).toThrow('Repo wird gerade zurückgesetzt')
    await expect(resetSystem(ctx.deps)).rejects.toThrow('Repo wird gerade zurückgesetzt')
    release()
    await reset

    startStage(ctx.deps, 'CB-1', { model: 'm' })
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('running')
    await ctx.settle()
  })

  it('keeps running and reports a failed repo reset', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.failures.resetBaseBranch = new CodeHostError(422, 'Branch-Schutz auf showcase verhindert den Reset')
    ctx.codeHost.failures.deleteBranch = new CodeHostError(500, 'boom')

    const { warnings } = await resetSystem(ctx.deps)

    expect(warnings).toEqual([
      expect.stringContaining('CB-1/intent'),
      expect.stringContaining('CB-1/spec'),
      expect.stringContaining('Branch-Schutz'),
    ])
    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'plan', state: 'ready' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Branch-Schutz'))
  })

  it('picks up a new ticket file', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    await startup(ctx.deps)
    ctx.source.tickets.push(sourceTicket('CB-4'))
    await resetSystem(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => t.key)).toEqual(['CB-1', 'CB-4'])
  })
})
