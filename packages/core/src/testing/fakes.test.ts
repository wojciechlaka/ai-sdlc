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
})
