import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import type { TicketRepository } from '../../ports'

let repo: TicketRepository

beforeEach(() => {
  repo = createSqliteTicketRepository(createTestDatabase())
})

describe('create / findById', () => {
  it('inserts a row with defaults', () => {
    const t = repo.create({ title: 'Test', description: 'Desc' })
    expect(t.title).toBe('Test')
    expect(t.description).toBe('Desc')
    expect(t.status).toBe('backlog')
    expect(t.iteration).toBe(0)
    expect(repo.findById(t.id)?.id).toBe(t.id)
  })

  it('returns null for unknown ids', () => {
    expect(repo.findById(9999)).toBeNull()
  })
})

describe('list / count', () => {
  it('returns all tickets in insertion order', () => {
    repo.create({ title: 'A', description: '' })
    repo.create({ title: 'B', description: '' })
    expect(repo.list().map((t) => t.title)).toEqual(['A', 'B'])
    expect(repo.count()).toBe(2)
  })
})

describe('updateStatus', () => {
  it('changes status', () => {
    const t = repo.create({ title: 'T', description: '' })
    repo.updateStatus(t.id, 'refining')
    expect(repo.findById(t.id)?.status).toBe('refining')
  })

  it('throws for unknown id', () => {
    expect(() => repo.updateStatus(9999, 'review')).toThrow('not found')
  })
})

describe('delete', () => {
  it('removes the row', () => {
    const t = repo.create({ title: 'T', description: '' })
    repo.delete(t.id)
    expect(repo.findById(t.id)).toBeNull()
  })

  it('throws for unknown id', () => {
    expect(() => repo.delete(9999)).toThrow('not found')
  })
})

describe('replaceAll', () => {
  it('replaces all tickets with the given ones', () => {
    repo.create({ title: 'Extra', description: '' })
    const created = repo.replaceAll([
      { title: 'S1', description: 'd1' },
      { title: 'S2', description: 'd2' },
    ])
    expect(created.map((t) => t.title)).toEqual(['S1', 'S2'])
    expect(repo.list().map((t) => t.title)).toEqual(['S1', 'S2'])
    expect(created.every((t) => t.status === 'backlog')).toBe(true)
  })
})
