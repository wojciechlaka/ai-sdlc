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
