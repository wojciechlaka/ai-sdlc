import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestContext, SAMPLE_META, type TestContext } from '../testing/fakes'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import { runInitialRefinement, runAnswer } from './refinementJobs'
import type { Ticket } from '../domain/types'

let ctx: TestContext
let ticket: Ticket

const PARAMS = { repo: 'https://github.com/x/y', model: 'm', acceptanceCriteria: 'AC' }

beforeEach(() => {
  ctx = createTestContext()
  ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
  ctx.deps.tickets.updateStatus(ticket.id, 'refining')
})

const progressMessages = () =>
  ctx.events.published.flatMap((e) => (e.type === 'progress' ? [e.message] : []))

describe('runInitialRefinement', () => {
  it('completes the run and moves the ticket to review on a refinement', async () => {
    ctx.repos.summary = '# Summary'
    await runInitialRefinement(ctx.deps, ticket, PARAMS)

    const [run] = ctx.store.runs
    expect(run).toMatchObject({ status: 'succeeded', trigger: 'initial', costUsd: SAMPLE_META.costUsd })
    expect(run.input).toEqual({ ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: 'AC', repo: PARAMS.repo, model: 'm' })
    expect(ctx.agent.calls[0]).toMatchObject({ ticketId: 'T-1', repoPath: '/repo', codebaseSummary: '# Summary' })
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('review')
    expect(ctx.events.published.at(-1)).toEqual({ type: 'status', ticketId: 'T-1', status: 'review' })
    expect(ctx.store.audit.map((a) => a.type)).toEqual(['run_started', 'run_finished'])
    expect(progressMessages()).toEqual([
      'Repository wird vorbereitet...',
      'Repository bereit.',
      'Agent wird gestartet...',
    ])
  })

  it('marks the ticket failed when the run cannot be created', async () => {
    vi.spyOn(ctx.deps.runs, 'create').mockImplementation(() => {
      throw new Error('db down')
    })
    await expect(runInitialRefinement(ctx.deps, ticket, PARAMS)).resolves.toBeUndefined()

    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
    expect(ctx.events.published.at(-1)).toEqual({ type: 'status', ticketId: 'T-1', status: 'failed' })
    expect(progressMessages()).toContain('Fehler: db down')
  })

  it('announces a missing codebase summary', async () => {
    ctx.repos.summary = null
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(progressMessages()).toContain('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  })

  it('keeps the ticket refining and publishes the question on a question output', async () => {
    ctx.agent.outcome = { output: { type: 'question', question: 'Welche DB?' }, meta: SAMPLE_META }
    await runInitialRefinement(ctx.deps, ticket, PARAMS)

    expect(ctx.store.runs[0].status).toBe('succeeded')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('refining')
    expect(ctx.events.published.slice(-2)).toEqual([
      { type: 'progress', ticketId: 'T-1', message: 'Agent stellt eine Rückfrage...' },
      { type: 'question', ticketId: 'T-1', question: 'Welche DB?' },
    ])
  })

  it('forwards agent progress as events', async () => {
    ctx.agent.progress = ['Codebase wird analysiert...']
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(progressMessages()).toContain('Codebase wird analysiert...')
  })

  it('marks run and ticket failed on agent errors', async () => {
    ctx.agent.outcome = new Error('boom')
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('failed')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
    expect(progressMessages()).toContain('Fehler: boom')
  })

  it('marks the run as timeout on AgentRunTimeoutError', async () => {
    ctx.agent.outcome = new AgentRunTimeoutError(50)
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('timeout')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
  })

  it('returns the ticket to backlog when the run was stopped', async () => {
    ctx.agent.outcome = new AgentRunTerminatedError()
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('failed')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('backlog')
  })

  it('fails without creating a run when the repository cannot be loaded', async () => {
    ctx.repos.ensureRepoError = Object.assign(new Error('clone failed'), { stderr: Buffer.from('fatal: not found') })
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs).toHaveLength(0)
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
    expect(progressMessages()).toContain('Fehler: Repository konnte nicht geladen werden. (fatal: not found)')
  })
})

describe('runAnswer', () => {
  function askQuestion() {
    const run = ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: 'AC', repo: PARAMS.repo, model: 'm' },
    })
    ctx.deps.runs.complete(run.id, {
      output: { type: 'question', question: 'Welche DB?' },
      costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
  }

  it('aborts silently when no question is pending', async () => {
    await runAnswer(ctx.deps, ticket, 'egal')
    expect(ctx.store.runs).toHaveLength(0)
    expect(ctx.agent.calls).toHaveLength(0)
  })

  it('starts an answer run with the Q&A history and the original repo and model', async () => {
    askQuestion()
    await runAnswer(ctx.deps, ticket, 'Postgres')

    const answerRun = ctx.store.runs[1]
    expect(answerRun.trigger).toBe('answer')
    expect(answerRun.input.previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
    expect(ctx.repos.requestedUrls).toEqual([PARAMS.repo])
    expect(ctx.agent.calls[0].previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('review')
    expect(progressMessages()[0]).toBe('Antwort empfangen — Agent analysiert Antwort...')
  })
})
