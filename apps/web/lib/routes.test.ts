import { describe, it, expect } from 'vitest'
import { ticketPath } from './routes'

describe('ticketPath', () => {
  it('points to the ticket page', () => {
    expect(ticketPath('CB-1')).toBe('/tickets/CB-1')
  })
})
