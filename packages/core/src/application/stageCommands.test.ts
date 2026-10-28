import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRunTerminatedError, AgentRunTimeoutError, CodeHostError } from '../ports'
import { SAMPLE_INTENT_OUTPUT, SAMPLE_META, createTestContext, errorCodeOf, seedTicket, type TestContext } from '../testing/fakes'
import { answerQuestion, startStage, stopRun } from './stageCommands'

const MODEL = { model: 'claude-sonnet-4-6' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function start(ctx: TestContext, key = 'CB-2') {
  startStage(ctx.deps, key, MODEL)
  await ctx.settle()
  return ctx.deps.tickets.findByKey(key)!
}

function setup(patch: Parameters<typeof seedTicket>[2] = {}) {
  const ctx = createTestContext()
  seedTicket(ctx, 'CB-2', { title: 'Lesezeit bei Artikeln anzeigen', ...patch })
  return ctx
}

describe('startStage — success', () => {
  it('writes the intent on its own branch, opens the PR and waits for review', async () => {
    const ctx = setup()

    expect(await start(ctx)).toMatchObject({ stage: 'plan', state: 'in_review' })

    const file = ctx.codeHost.branches.get('CB-2/intent')?.get('docs/work/CB-2/intent.md')
    expect(file).toContain('ticket: CB-2\nstage: plan\nsource: examples/tickets/cb-2.md')
    expect(file).toContain('# CB-2: Lesezeit anzeigen')
    expect(ctx.codeHost.pulls[0]).toMatchObject({ number: 1, headBranch: 'CB-2/intent', title: 'CB-2: Intent', state: 'open' })
    expect(ctx.codeHost.pulls[0]?.body).toContain('„Lesezeit bei Artikeln anzeigen“')
    expect(ctx.deps.artifacts.findOpen('CB-2', 'plan')).toMatchObject({ prNumber: 1, branch: 'CB-2/intent', path: 'docs/work/CB-2/intent.md' })
  })

  it('runs the plan agent on the updated clone', async () => {
    const ctx = setup()
    ctx.repos.summary = 'Express + Prisma'
    await start(ctx)
    expect(ctx.repos.requestedUrls).toEqual(['https://github.com/o/r'])
    expect(ctx.agent.calls[0]).toMatchObject({
      ticketKey: 'CB-2', stage: 'plan', title: 'Lesezeit bei Artikeln anzeigen', model: 'claude-sonnet-4-6',
      repoPath: '/repo', codebaseSummary: 'Express + Prisma', previousRuns: [],
    })
  })

  it('logs run and PR and publishes the state changes', async () => {
    const ctx = setup()
    await start(ctx)

    expect(ctx.store.audit.map((e) => e.type)).toEqual(['run_started', 'run_finished', 'pr_opened'])
    expect(ctx.store.audit[0]?.payload).toMatchObject({ stage: 'plan', trigger: 'initial', model: 'claude-sonnet-4-6' })
    expect(ctx.store.audit[1]?.payload).toMatchObject({
      status: 'succeeded', model: 'm', durationSeconds: 1, costUsd: 0.001, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5,
    })
    expect(ctx.store.audit[2]?.payload).toEqual({ prNumber: 1, prUrl: 'https://github.com/o/r/pull/1', branch: 'CB-2/intent' })
    expect(ctx.events.published.flatMap((e) => (e.type === 'state' ? [e.state] : []))).toEqual(['running', 'in_review'])
    expect(ctx.store.runs[0]).toMatchObject({ stage: 'plan', trigger: 'initial', status: 'succeeded', input: { model: 'claude-sonnet-4-6', previousRuns: [] } })
  })

  it('replaces a branch left over from an earlier attempt', async () => {
    const ctx = setup()
    ctx.codeHost.branches.set('CB-2/intent', new Map([['old.md', 'x']]))
    await start(ctx)
    expect([...ctx.codeHost.branches.get('CB-2/intent')!.keys()]).toEqual(['docs/work/CB-2/intent.md'])
    expect(ctx.codeHost.calls.indexOf('deleteBranch')).toBeLessThan(ctx.codeHost.calls.indexOf('createBranch'))
  })

  it('waits for an answer when the agent asks', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: { type: 'question', question: 'Gilt das auch für Entwürfe?' }, meta: SAMPLE_META }

    expect(await start(ctx)).toMatchObject({ state: 'awaiting_answer' })
    expect(ctx.events.published).toContainEqual({ type: 'question', ticketKey: 'CB-2', question: 'Gilt das auch für Entwürfe?' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'question_asked', actor: 'agent', payload: { question: 'Gilt das auch für Entwürfe?' } })
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('starts again after a failure', async () => {
    const ctx = setup({ state: 'failed' })
    expect(await start(ctx)).toMatchObject({ state: 'in_review' })
  })
})

describe('startStage — failures', () => {
  it('fails with the GitHub message when the PR cannot be opened; the run itself succeeded', async () => {
    const ctx = setup()
    ctx.codeHost.failures.openPullRequest = new CodeHostError(403, 'PR für CB-2/intent öffnen: Rechte fehlen')

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', actor: 'system', payload: { message: 'PR für CB-2/intent öffnen: Rechte fehlen' } })
    expect(ctx.store.runs[0]?.status).toBe('succeeded')
    expect(ctx.deps.artifacts.listForTicket('CB-2')).toEqual([])
  })

  it('fails when the repository cannot be cloned', async () => {
    const ctx = setup()
    ctx.repos.ensureRepoError = new Error('could not resolve host')

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)?.payload).toEqual({ message: 'Repository konnte nicht geladen werden. (could not resolve host)' })
    expect(ctx.agent.calls).toEqual([])
  })

  it('records a timeout', async () => {
    const ctx = setup()
    ctx.agent.outcome = new AgentRunTimeoutError(5)

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.runs[0]?.status).toBe('timeout')
    expect(ctx.store.audit.map((e) => e.type)).toEqual(['run_started', 'run_finished', 'error'])
  })

  it('returns to ready when the agent is terminated', async () => {
    const ctx = setup()
    ctx.agent.outcome = new AgentRunTerminatedError()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    // The real stop sets `ready` before the process ends (Task 16); simulate that order.
    ctx.deps.tickets.update('CB-2', { state: 'ready' })
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.store.audit.map((e) => e.type)).not.toContain('error')
  })
})

describe('startStage — rejected', () => {
  it('rejects unknown tickets, invalid input and wrong states', () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { state: 'running' })
    seedTicket(ctx, 'CB-2', { state: 'in_review' })
    seedTicket(ctx, 'CB-3', { state: 'awaiting_answer' })
    seedTicket(ctx, 'CB-4', { stage: 'design' })
    seedTicket(ctx, 'CB-5', { stage: 'done' })
    seedTicket(ctx, 'CB-6')

    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-404', MODEL))).toBe('NOT_FOUND')
    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-6', { model: '' }))).toBe('VALIDATION')
    for (const key of ['CB-1', 'CB-2', 'CB-3', 'CB-4', 'CB-5']) {
      expect(errorCodeOf(() => startStage(ctx.deps, key, MODEL))).toBe('CONFLICT')
    }
    expect(ctx.agent.calls).toEqual([])
  })

  it('rejects the start without token and says why', () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1')
    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-1', MODEL))).toBe('CONFLICT')
    expect(() => startStage(ctx.deps, 'CB-1', MODEL)).toThrow('GITHUB_TOKEN')
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
  })
})

async function askQuestion(ctx: TestContext): Promise<void> {
  ctx.agent.outcome = { output: { type: 'question', question: 'Wer?' }, meta: SAMPLE_META }
  startStage(ctx.deps, 'CB-2', MODEL)
  await ctx.settle()
  ctx.agent.outcome = { output: SAMPLE_INTENT_OUTPUT, meta: SAMPLE_META }
}

describe('answerQuestion', () => {
  it('continues the stage with the Q&A history and documents the answer in the intent', async () => {
    const ctx = setup()
    await askQuestion(ctx)

    answerQuestion(ctx.deps, 'CB-2', { answer: 'Alle Leser' })
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('running')
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.agent.calls[1]).toMatchObject({ model: 'claude-sonnet-4-6', previousRuns: [{ question: 'Wer?', answer: 'Alle Leser' }] })
    expect(ctx.store.runs[1]).toMatchObject({ trigger: 'answer', seq: 2 })
    expect(ctx.codeHost.branches.get('CB-2/intent')?.get('docs/work/CB-2/intent.md')).toContain('**F:** Wer?\\\n**A:** Alle Leser')
    expect(ctx.store.audit.find((e) => e.type === 'answer_given')).toMatchObject({ actor: 'human', payload: { answer: 'Alle Leser' } })
  })

  it('rejects a second answer while the first one runs', async () => {
    const ctx = setup()
    await askQuestion(ctx)
    answerQuestion(ctx.deps, 'CB-2', { answer: 'A' })
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'B' }))).toBe('CONFLICT')
    await ctx.settle()
  })

  it('rejects answers without an open question, blank answers and unknown tickets', async () => {
    const ctx = setup()
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'A' }))).toBe('CONFLICT')
    await askQuestion(ctx)
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: '  ' }))).toBe('VALIDATION')
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-404', { answer: 'A' }))).toBe('NOT_FOUND')
  })

  it('rejects answers without token', () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-2', { state: 'awaiting_answer' })
    expect(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'A' })).toThrow('GITHUB_TOKEN')
  })
})

describe('stopRun', () => {
  it('stops a running agent and returns the ticket to ready at once', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))

    stopRun(ctx.deps, 'CB-2')

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.agent.stopped).toEqual(['CB-2'])
    release()
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('cancels the job when stopped while the clone is prepared', async () => {
    const ctx = setup()
    const summary = vi.spyOn(ctx.repos, 'ensureSummary')
    startStage(ctx.deps, 'CB-2', MODEL)
    stopRun(ctx.deps, 'CB-2')
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.agent.calls).toEqual([])
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(summary).not.toHaveBeenCalled()
  })

  it('discards a result that arrives after the stop', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    ctx.deps.tickets.update('CB-2', { state: 'ready' }) // stopped, but the agent did not react to the signal
    release()
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('drops an open question', async () => {
    const ctx = setup()
    await askQuestion(ctx)
    stopRun(ctx.deps, 'CB-2')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
  })

  it('ignores unknown tickets and tickets without a run', () => {
    const ctx = setup({ state: 'in_review' })
    expect(() => stopRun(ctx.deps, 'CB-404')).not.toThrow()
    stopRun(ctx.deps, 'CB-2')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.agent.stopped).toEqual([])
  })
})

describe('stale attempts', () => {
  it('stop and restart while the old agent is held: only the new attempt publishes', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    stopRun(ctx.deps, 'CB-2')
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(2))
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.codeHost.pulls.filter((p) => p.state === 'open')).toHaveLength(1)
    expect(ctx.store.runs.map((r) => r.status)).toEqual(['failed', 'succeeded'])
  })

  it('stop during publish closes the opened PR and deletes the branch', async () => {
    const ctx = setup()
    let openGate!: () => void
    const gate = new Promise<void>((resolve) => { openGate = resolve })
    const original = ctx.codeHost.openPullRequest.bind(ctx.codeHost)
    let reached = false
    ctx.codeHost.openPullRequest = async (input) => {
      reached = true
      await gate
      return original(input)
    }
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(reached).toBe(true))
    stopRun(ctx.deps, 'CB-2')
    openGate()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.codeHost.pulls.every((p) => p.state !== 'open')).toBe(true)
    expect(ctx.codeHost.branches.has('CB-2/intent')).toBe(false)
    expect(ctx.deps.artifacts.listForTicket('CB-2')).toEqual([])
  })

  it('a reset during the agent run leaves the new ticket untouched', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    ctx.deps.tickets.clear()
    seedTicket(ctx, 'CB-2')
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.codeHost.pulls).toEqual([])
    expect(ctx.store.runs).toEqual([])
    expect(ctx.store.audit).toEqual([])
  })

  it('fails when the agent is terminated from outside', async () => {
    const ctx = setup()
    ctx.agent.outcome = new AgentRunTerminatedError()

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', payload: { message: 'Agent-Lauf wurde beendet' } })
  })
})
