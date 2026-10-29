import { describe, it, expect } from 'vitest'
import { createTestContext } from '../testing/fakes'
import { startup } from './startup'

const RUN_INPUT = { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' }

describe('startup', () => {
  it('seeds an empty database with the three example tickets', () => {
    const ctx = createTestContext()
    startup(ctx.deps)
    expect(ctx.deps.tickets.count()).toBe(3)
  })

  it('does not seed when tickets exist', () => {
    const ctx = createTestContext()
    ctx.deps.tickets.create({ title: 'Mine', description: 'x' })
    startup(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => t.title)).toEqual(['Mine'])
  })

  it('marks runs left running after a crash as failed, including their tickets', () => {
    const ctx = createTestContext()
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(ticket.id, 'refining')
    const run = ctx.deps.runs.create({ ticketId: ticket.id, trigger: 'initial', model: 'm', input: RUN_INPUT })

    startup(ctx.deps)

    expect(ctx.deps.runs.findById(run.id)?.status).toBe('failed')
    expect(ctx.deps.runs.findById(run.id)?.finishedAt).toBeInstanceOf(Date)
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
  })
})
