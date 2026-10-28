import { describe, it, expect, beforeEach } from 'vitest'
import { createTestContext, errorCodeOf, type TestContext } from '../testing/fakes'
import { listTickets, getTicket } from './queries'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestContext()
})

const RUN_INPUT = { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' }

describe('listTickets', () => {
  it('returns DTOs with public ids', () => {
    ctx.deps.tickets.create({ title: 'A', description: 'a' })
    const [dto] = listTickets(ctx.deps)
    expect(dto).toMatchObject({ id: 'T-1', title: 'A', description: 'a', status: 'backlog', iteration: 0 })
    expect(dto.createdAt).toBeInstanceOf(Date)
  })
})

describe('getTicket', () => {
  it('returns the ticket with latestRun null when there are no runs', () => {
    ctx.deps.tickets.create({ title: 'A', description: 'a' })
    expect(getTicket(ctx.deps, 'T-1').latestRun).toBeNull()
  })

  it('returns the latest run as DTO without its input', () => {
    const ticket = ctx.deps.tickets.create({ title: 'A', description: 'a' })
    ctx.deps.runs.create({ ticketId: ticket.id, trigger: 'initial', model: 'm', input: RUN_INPUT })
    const detail = getTicket(ctx.deps, 'T-1')
    expect(detail.latestRun).toMatchObject({ id: 'run-1', ticketId: 'T-1', status: 'running', trigger: 'initial' })
    expect(detail.latestRun).not.toHaveProperty('input')
  })

  it('throws NotFoundError for unknown and malformed ids', () => {
    expect(errorCodeOf(() => getTicket(ctx.deps, 'T-99'))).toBe('NOT_FOUND')
    expect(errorCodeOf(() => getTicket(ctx.deps, 'garbage'))).toBe('NOT_FOUND')
  })
})
