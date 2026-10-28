import { describe, it, expect, beforeEach } from 'vitest'
import { createTestContext, errorCodeOf, SAMPLE_META, SAMPLE_REFINEMENT, type TestContext } from '../testing/fakes'
import { createUseCases, type UseCases } from './createUseCases'
import { SEED_TICKETS } from '../domain/seeds'

let ctx: TestContext
let useCases: UseCases

beforeEach(() => {
  ctx = createTestContext()
  useCases = createUseCases(ctx.deps)
})

const START = { repo: 'https://github.com/x/y', model: 'm' }

describe('createTicket', () => {
  it('creates the ticket and writes an audit event', () => {
    const dto = useCases.createTicket({ title: 'Neu', description: 'Beschreibung' })
    expect(dto).toMatchObject({ id: 'T-1', title: 'Neu', status: 'backlog' })
    expect(ctx.store.audit).toEqual([{ ticketId: 1, actor: 'human', type: 'ticket_created', payload: null }])
  })

  it('rejects invalid input with a ValidationError', () => {
    expect(errorCodeOf(() => useCases.createTicket({ title: 'x' }))).toBe('VALIDATION')
  })
})

describe('startRefinement', () => {
  it('sets refining, publishes the status and runs the agent in the background', async () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    useCases.startRefinement('T-1', START)

    expect(useCases.getTicket('T-1').status).toBe('refining')
    expect(ctx.events.published[0]).toEqual({ type: 'status', ticketId: 'T-1', status: 'refining' })

    await ctx.settle()
    expect(useCases.getTicket('T-1').status).toBe('review')
    expect(ctx.agent.calls[0]).toMatchObject({ acceptanceCriteria: '' })
  })

  it('rejects unknown tickets, invalid input and non-refineable states', () => {
    expect(errorCodeOf(() => useCases.startRefinement('T-9', START))).toBe('NOT_FOUND')
    useCases.createTicket({ title: 'T', description: 'D' })
    expect(errorCodeOf(() => useCases.startRefinement('T-1', { model: 'm' }))).toBe('VALIDATION')
    useCases.startRefinement('T-1', START)
    expect(errorCodeOf(() => useCases.startRefinement('T-1', START))).toBe('CONFLICT')
  })
})

describe('answerQuestion', () => {
  it('rejects answers when the ticket is not refining', () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: 'x' }))).toBe('CONFLICT')
  })

  it('rejects a second answer while the first is still running', () => {
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(ticket.id, 'refining')
    ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'answer', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: 'x' }))).toBe('CONFLICT')
    expect(() => useCases.answerQuestion('T-1', { answer: 'x' })).toThrow('Answer already in progress')
  })

  it('validates the answer and continues in the background', async () => {
    ctx.agent.outcome = { output: { type: 'question', question: 'Welche DB?' }, meta: SAMPLE_META }
    useCases.createTicket({ title: 'T', description: 'D' })
    useCases.startRefinement('T-1', START)
    await ctx.settle()

    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: '  ' }))).toBe('VALIDATION')

    ctx.agent.outcome = { output: SAMPLE_REFINEMENT, meta: SAMPLE_META }
    useCases.answerQuestion('T-1', { answer: 'Postgres' })
    await ctx.settle()
    expect(useCases.getTicket('T-1').status).toBe('review')
    expect(ctx.agent.calls[1].previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
  })
})

describe('stopRefinement', () => {
  it('stops the agent and returns a refining ticket to backlog', async () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(1, 'refining')
    await useCases.stopRefinement('T-1')
    expect(ctx.agent.stopped).toEqual(['T-1'])
    expect(useCases.getTicket('T-1').status).toBe('backlog')
    expect(ctx.events.published.at(-1)).toEqual({ type: 'status', ticketId: 'T-1', status: 'backlog' })
  })

  it('ignores unknown tickets', async () => {
    await expect(useCases.stopRefinement('T-404')).resolves.toBeUndefined()
  })
})

describe('deleteTicket', () => {
  it('deletes idle tickets and refuses while refining', () => {
    useCases.createTicket({ title: 'A', description: 'a' })
    useCases.createTicket({ title: 'B', description: 'b' })
    ctx.deps.tickets.updateStatus(2, 'refining')

    useCases.deleteTicket('T-1')
    expect(useCases.listTickets().map((t) => t.id)).toEqual(['T-2'])
    expect(errorCodeOf(() => useCases.deleteTicket('T-2'))).toBe('CONFLICT')
    expect(errorCodeOf(() => useCases.deleteTicket('T-9'))).toBe('NOT_FOUND')
  })
})

describe('resetSystem', () => {
  it('stops running agents and restores the seed tickets', async () => {
    useCases.createTicket({ title: 'A', description: 'a' })
    ctx.deps.tickets.updateStatus(1, 'refining')

    const tickets = await useCases.resetSystem()

    expect(ctx.agent.stopped).toEqual(['T-1'])
    expect(tickets.map((t) => t.title)).toEqual(SEED_TICKETS.map((s) => s.title))
  })
})

describe('subscribeToTicket', () => {
  it('delivers events of the ticket until unsubscribed', () => {
    const received: string[] = []
    const unsubscribe = useCases.subscribeToTicket('T-1', (e) => received.push(e.type))
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'x' })
    unsubscribe()
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'y' })
    expect(received).toEqual(['progress'])
  })
})
