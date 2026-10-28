import { describe, it, expect } from 'vitest'
import { createTestContext, errorCodeOf } from './fakes'
import { ConflictError } from '../domain/errors'

describe('errorCodeOf', () => {
  it('returns the domain code or null', () => {
    expect(errorCodeOf(() => { throw new ConflictError('x') })).toBe('CONFLICT')
    expect(errorCodeOf(() => { throw new Error('x') })).toBeNull()
    expect(errorCodeOf(() => 1)).toBeNull()
  })
})

describe('in-memory repositories', () => {
  it('increment the ticket iteration when a run is created', () => {
    const ctx = createTestContext()
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    const run = ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    expect(run.iteration).toBe(1)
    expect(ctx.deps.tickets.findById(ticket.id)?.iteration).toBe(1)
    expect(ctx.deps.runs.latestForTicket(ticket.id)?.id).toBe(run.id)
  })

  it('record published events and collect background tasks', async () => {
    const ctx = createTestContext()
    let done = false
    ctx.deps.runInBackground(new Promise<void>((resolve) => setTimeout(() => { done = true; resolve() }, 5)))
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'x' })
    await ctx.settle()
    expect(done).toBe(true)
    expect(ctx.events.published).toEqual([{ type: 'progress', ticketId: 'T-1', message: 'x' }])
  })

  it('return snapshots instead of live objects', () => {
    const ctx = createTestContext()
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(ticket.id, 'refining')
    expect(ticket.status).toBe('backlog')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('refining')
    expect(ctx.deps.tickets.findById(ticket.id)).not.toBe(ctx.deps.tickets.findById(ticket.id))

    const run = ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    ctx.deps.runs.fail(run.id, 'failed')
    expect(run.status).toBe('running')
    expect(ctx.deps.runs.findById(run.id)?.status).toBe('failed')
    expect(ctx.store.runs[0].status).toBe('failed')
  })

  it('cascade ticket deletion to audit entries', () => {
    const ctx = createTestContext()
    const a = ctx.deps.tickets.create({ title: 'A', description: 'D' })
    const b = ctx.deps.tickets.create({ title: 'B', description: 'D' })
    ctx.deps.audit.append({ ticketId: a.id, actor: 'human', type: 'x' })
    ctx.deps.audit.append({ ticketId: b.id, actor: 'human', type: 'x' })
    ctx.deps.tickets.delete(a.id)
    expect(ctx.store.audit.map((e) => e.ticketId)).toEqual([b.id])
  })
})
