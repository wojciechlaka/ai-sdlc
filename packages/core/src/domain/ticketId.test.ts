import { describe, it, expect } from 'vitest'
import { formatTicketId, parseTicketId } from './ticketId'

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
