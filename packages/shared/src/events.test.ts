import { describe, it, expect } from 'vitest'
import { RefinementEventSchema } from './events'

describe('RefinementEventSchema', () => {
  it('accepts the three event types', () => {
    expect(RefinementEventSchema.parse({ type: 'progress', ticketId: 'T-1', message: 'm' }).type).toBe('progress')
    expect(RefinementEventSchema.parse({ type: 'question', ticketId: 'T-1', question: 'q' }).type).toBe('question')
    expect(RefinementEventSchema.parse({ type: 'status', ticketId: 'T-1', status: 'review' }).type).toBe('status')
  })

  it('rejects unknown types and invalid status values', () => {
    expect(RefinementEventSchema.safeParse({ type: 'other', ticketId: 'T-1' }).success).toBe(false)
    expect(RefinementEventSchema.safeParse({ type: 'status', ticketId: 'T-1', status: 'done' }).success).toBe(false)
  })
})
