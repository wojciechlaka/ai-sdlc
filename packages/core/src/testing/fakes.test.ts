import { describe, it, expect } from 'vitest'
import { AgentRunTerminatedError, CodeHostError } from '../ports'
import { createTestContext, seedTicket, sourceTicket } from './fakes'

describe('in-memory ticket repository', () => {
  it('inserts new tickets as plan/ready and keeps stage and state on update', () => {
    const { deps } = createTestContext()
    expect(deps.tickets.upsertFromSource([sourceTicket('CB-10'), sourceTicket('CB-2')])).toEqual(['CB-10', 'CB-2'])
    deps.tickets.update('CB-2', { stage: 'design', state: 'failed' })

    expect(deps.tickets.upsertFromSource([sourceTicket('CB-2', { title: 'Neu' })])).toEqual([])
    expect(deps.tickets.findByKey('CB-2')).toMatchObject({ title: 'Neu', stage: 'design', state: 'failed' })
    expect(deps.tickets.list().map((t) => t.key)).toEqual(['CB-2', 'CB-10'])
  })

  it('returns snapshots, not the stored objects', () => {
    const ctx = createTestContext()
    const ticket = seedTicket(ctx, 'CB-1')
    ticket.state = 'failed'
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
  })
})

describe('FakeCodeHost', () => {
  it('merges a PR like GitHub: the branch files land on the default branch', async () => {
    const { codeHost } = createTestContext()
    await codeHost.createBranch('CB-1/intent')
    await codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    const pr = await codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: 'b' })

    codeHost.merge(pr.number)

    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBe('x')
    expect((await codeHost.getPullRequest(pr.number)).state).toBe('merged')
  })

  it('reports unknown PRs as 404 and injected failures as given', async () => {
    const { codeHost } = createTestContext()
    await expect(codeHost.getPullRequest(9)).rejects.toMatchObject({ status: 404 })
    codeHost.failures.readFile = new CodeHostError(0, 'offline')
    await expect(codeHost.readFile('a')).rejects.toThrow('offline')
  })
})

describe('stricter fakes', () => {
  it('rejects PRs for missing, empty or already opened branches', async () => {
    const { codeHost } = createTestContext()
    await expect(codeHost.openPullRequest({ branch: 'x', title: 't', body: 'b' })).rejects.toMatchObject({ status: 422 })
    await codeHost.createBranch('x')
    await expect(codeHost.openPullRequest({ branch: 'x', title: 't', body: 'b' })).rejects.toMatchObject({ status: 422 })
    await codeHost.commitFile({ branch: 'x', path: 'a', content: 'c', message: 'm' })
    const pr = await codeHost.openPullRequest({ branch: 'x', title: 't', body: 'b' })
    expect(pr).not.toHaveProperty('title')
    await expect(codeHost.openPullRequest({ branch: 'x', title: 't', body: 'b' })).rejects.toMatchObject({ status: 422 })
  })

  it('closes open PRs when their branch is deleted and keeps merged ones merged', async () => {
    const { codeHost } = createTestContext()
    const open = codeHost.seedPullRequest('a')
    await codeHost.deleteBranch('a')
    expect(codeHost.pulls[0].state).toBe('closed')

    const merged = codeHost.seedPullRequest('b')
    codeHost.merge(merged.number)
    await codeHost.closePullRequest(merged.number)
    expect(codeHost.pulls[1].state).toBe('merged')
    expect(() => codeHost.merge(open.number)).toThrow(CodeHostError)
  })

  it('rejects artifacts and log entries for unknown tickets and returns deep copies', () => {
    const ctx = createTestContext()
    expect(() => ctx.deps.audit.append({ ticketKey: 'CB-9', actor: 'system', type: 'error' })).toThrow('Ticket CB-9 not found')
    expect(() => ctx.deps.artifacts.create({ ticketKey: 'CB-9', stage: 'plan', path: 'p', branch: 'b', prNumber: 1, prUrl: 'u' })).toThrow('Ticket CB-9 not found')

    seedTicket(ctx, 'CB-1')
    ctx.deps.audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'error', payload: { a: { b: 1 } } })
    ;(ctx.deps.audit.listForTicket('CB-1')[0].payload as { a: { b: number } }).a.b = 2
    expect(ctx.deps.audit.listForTicket('CB-1')[0].payload).toEqual({ a: { b: 1 } })
  })
})

describe('FakeAgentRunner', () => {
  it('terminates a held run when it is stopped', async () => {
    const { agent } = createTestContext()
    const release = agent.hold()
    const run = agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, () => {})

    expect(agent.stop('CB-1')).toBe(true)
    release()

    await expect(run).rejects.toBeInstanceOf(AgentRunTerminatedError)
  })

  it('does not affect a later run when nothing was running', async () => {
    const { agent } = createTestContext()
    expect(agent.stop('CB-1')).toBe(false)
    const result = await agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, () => {})
    expect(result.output.type).toBe('intent')
  })
})
