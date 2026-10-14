import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTicket, getTicket, listTickets, updateTicketStatus,
  incrementIteration, deleteTicket, resetToSeeds,
  formatTicketId, parseTicketId,
} from './tickets'
import { db } from './client'
import { tickets } from './schema'

beforeEach(() => {
  db.delete(tickets).run()
})

describe('createTicket', () => {
  it('inserts a row with defaults', () => {
    const t = createTicket({ title: 'Test', description: 'Desc' })
    expect(t.title).toBe('Test')
    expect(t.description).toBe('Desc')
    expect(t.status).toBe('backlog')
    expect(t.iteration).toBe(0)
  })
})

describe('getTicket', () => {
  it('returns the row by numeric id', () => {
    const t = createTicket({ title: 'Test', description: '' })
    expect(getTicket(t.id).id).toBe(t.id)
  })

  it('throws for unknown id', () => {
    expect(() => getTicket(9999)).toThrow('not found')
  })
})

describe('listTickets', () => {
  it('returns all tickets', () => {
    createTicket({ title: 'A', description: '' })
    createTicket({ title: 'B', description: '' })
    expect(listTickets()).toHaveLength(2)
  })
})

describe('updateTicketStatus', () => {
  it('changes status and touches updatedAt', () => {
    const t = createTicket({ title: 'T', description: '' })
    updateTicketStatus(t.id, 'refining')
    expect(getTicket(t.id).status).toBe('refining')
  })
})

describe('incrementIteration', () => {
  it('increments from 0 to 1', () => {
    const t = createTicket({ title: 'T', description: '' })
    incrementIteration(t.id)
    expect(getTicket(t.id).iteration).toBe(1)
  })

  it('increments twice gives 2', () => {
    const t = createTicket({ title: 'T', description: '' })
    incrementIteration(t.id)
    incrementIteration(t.id)
    expect(getTicket(t.id).iteration).toBe(2)
  })
})

describe('deleteTicket', () => {
  it('removes the row', () => {
    const t = createTicket({ title: 'T', description: '' })
    deleteTicket(t.id)
    expect(() => getTicket(t.id)).toThrow()
  })
})

describe('resetToSeeds', () => {
  it('replaces all tickets with the 3 CC seeds', () => {
    createTicket({ title: 'Extra', description: '' })
    const seeds = resetToSeeds()
    expect(seeds).toHaveLength(3)
    expect(seeds.every(s => s.status === 'backlog')).toBe(true)
    expect(seeds[0].title).toBe('CC-1: Eigene Fragen hinzufügen')
  })
})

describe('formatTicketId / parseTicketId', () => {
  it('formats integer as T-{n}', () => {
    expect(formatTicketId(1)).toBe('T-1')
    expect(formatTicketId(42)).toBe('T-42')
  })

  it('parses T-{n} back to integer', () => {
    expect(parseTicketId('T-1')).toBe(1)
    expect(parseTicketId('T-42')).toBe(42)
  })

  it('throws for invalid format', () => {
    expect(() => parseTicketId('invalid')).toThrow('Invalid ticket ID')
  })
})
