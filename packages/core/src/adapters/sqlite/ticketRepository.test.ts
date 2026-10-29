import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import type { TicketRepository } from '../../ports'

let repo: TicketRepository

beforeEach(() => {
  repo = createSqliteTicketRepository(createTestDatabase())
})

describe('upsertFromSource', () => {
  it('inserts new tickets as plan/ready and returns their keys', () => {
    expect(repo.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2', { priority: null })])).toEqual(['CB-1', 'CB-2'])
    expect(repo.findByKey('CB-1')).toMatchObject({
      key: 'CB-1', title: 'Ticket CB-1', description: 'Beschreibung CB-1', priority: 'Mittel',
      sourcePath: 'examples/tickets/cb-1.md', stage: 'plan', state: 'ready',
    })
    expect(repo.findByKey('CB-2')?.priority).toBeNull()
  })

  it('updates the text of known tickets and keeps stage and state', () => {
    repo.upsertFromSource([sourceTicket('CB-1')])
    repo.update('CB-1', { stage: 'design', state: 'failed' })

    expect(repo.upsertFromSource([sourceTicket('CB-1', { title: 'Neu', description: 'Neu D' })])).toEqual([])
    expect(repo.findByKey('CB-1')).toMatchObject({ title: 'Neu', description: 'Neu D', stage: 'design', state: 'failed' })
  })
})

describe('list / findByKey', () => {
  it('orders by key numerically', () => {
    repo.upsertFromSource([sourceTicket('CB-10'), sourceTicket('CB-2'), sourceTicket('AB-1')])
    expect(repo.list().map((t) => t.key)).toEqual(['AB-1', 'CB-2', 'CB-10'])
  })

  it('returns null for unknown keys', () => {
    expect(repo.findByKey('CB-404')).toBeNull()
  })
})

describe('update', () => {
  it('changes only the given fields and returns the ticket', () => {
    repo.upsertFromSource([sourceTicket('CB-1')])
    expect(repo.update('CB-1', { state: 'running' })).toMatchObject({ stage: 'plan', state: 'running' })
    expect(repo.update('CB-1', { stage: 'design', state: 'ready' })).toMatchObject({ stage: 'design', state: 'ready' })
  })

  it('throws for unknown tickets', () => {
    expect(() => repo.update('CB-404', { state: 'ready' })).toThrow('CB-404')
  })
})

describe('clear', () => {
  it('removes all tickets', () => {
    repo.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
    repo.clear()
    expect(repo.list()).toEqual([])
  })
})
