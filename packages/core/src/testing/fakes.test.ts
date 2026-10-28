import { describe, it, expect, vi } from 'vitest'
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
  it('merges a PR like GitHub: the branch files land on the base branch', async () => {
    const { codeHost } = createTestContext()
    await codeHost.createBranch('CB-1/intent')
    await codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    const pr = await codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: 'b' })

    codeHost.merge(pr.number)

    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBe('x')
    expect((await codeHost.getPullRequest(pr.number)).state).toBe('merged')
  })

  it('creates tag and base branch only when they are missing', async () => {
    const { codeHost } = createTestContext()
    codeHost.baseBranchExists = false
    codeHost.defaultBranchFiles.set('README.md', 'master')

    expect(await codeHost.prepareBaseBranch()).toEqual({ createdTag: true, createdBranch: true, baselineHasWork: false })
    expect(await codeHost.readFile('README.md')).toBe('master')

    codeHost.defaultBranchFiles.set('README.md', 'master v2')
    codeHost.files.set('docs/work/CB-1/intent.md', 'x')
    expect(await codeHost.prepareBaseBranch()).toEqual({ createdTag: false, createdBranch: false, baselineHasWork: false })
    expect(codeHost.baselineFiles?.get('README.md')).toBe('master')
    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBe('x')
    expect(codeHost.calls.filter((c) => c === 'prepareBaseBranch')).toHaveLength(2)
  })

  it('reports a new baseline that already contains docs/work', async () => {
    const { codeHost } = createTestContext()
    codeHost.defaultBranchFiles.set('docs/work/CB-1/intent.md', 'x')
    expect(await codeHost.prepareBaseBranch()).toMatchObject({ createdTag: true, baselineHasWork: true })
    expect(await codeHost.prepareBaseBranch()).toMatchObject({ createdTag: false, baselineHasWork: false })
  })

  it('resets the base branch to the tag: a merge after the tag is gone, the default branch untouched', async () => {
    const { codeHost } = createTestContext()
    codeHost.baselineFiles = new Map([['README.md', 'base']])
    codeHost.defaultBranchFiles.set('README.md', 'master')
    const pr = codeHost.seedPullRequest('CB-1/intent')
    await codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    codeHost.merge(pr.number)
    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBe('x')
    expect(codeHost.defaultBranchFiles.has('docs/work/CB-1/intent.md')).toBe(false)

    await codeHost.resetBaseBranch()

    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBeNull()
    expect(await codeHost.readFile('README.md')).toBe('base')
    codeHost.files.set('a', 'b')
    expect(codeHost.baselineFiles.has('a')).toBe(false)
  })

  it('refuses a reset without tag and reports injected failures for the new methods', async () => {
    const { codeHost } = createTestContext()
    await expect(codeHost.resetBaseBranch()).rejects.toMatchObject({ status: 422 })
    codeHost.failures.prepareBaseBranch = new CodeHostError(403, 'verboten')
    await expect(codeHost.prepareBaseBranch()).rejects.toThrow('verboten')
    expect(await codeHost.baseBranch()).toBe('showcase')
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
    const run = agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, { onProgress: () => {}, onToolEvent: () => {} })

    expect(agent.stop('CB-1')).toBe(true)
    release()

    await expect(run).rejects.toBeInstanceOf(AgentRunTerminatedError)
  })

  it('does not affect a later run when nothing was running', async () => {
    const { agent } = createTestContext()
    expect(agent.stop('CB-1')).toBe(false)
    const result = await agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, { onProgress: () => {}, onToolEvent: () => {} })
    expect(result.output.type).toBe('intent')
  })

  it('reports the scripted progress and tool events through the callbacks', async () => {
    const { agent } = createTestContext()
    agent.progress = ['Analyse']
    agent.toolEvents = [{ kind: 'used', tool: 'Read', target: 'a.ts' }]
    const onProgress = vi.fn()
    const onToolEvent = vi.fn()
    await agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, { onProgress, onToolEvent })
    expect(onProgress).toHaveBeenCalledWith('Analyse')
    expect(onToolEvent).toHaveBeenCalledWith({ kind: 'used', tool: 'Read', target: 'a.ts' })
    expect(agent.callbacks).toHaveLength(1)
  })
})
