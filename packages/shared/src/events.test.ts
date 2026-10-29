import { describe, it, expect } from 'vitest'
import { TicketEventSchema } from './events'

describe('TicketEventSchema', () => {
  it('accepts progress, question and state events', () => {
    expect(TicketEventSchema.parse({ type: 'progress', ticketKey: 'CB-1', message: 'm' }).type).toBe('progress')
    expect(TicketEventSchema.parse({ type: 'question', ticketKey: 'CB-1', question: 'q' }).type).toBe('question')
    expect(TicketEventSchema.parse({ type: 'state', ticketKey: 'CB-1', stage: 'design', state: 'ready' }).type).toBe('state')
  })
})
