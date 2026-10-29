import { z } from 'zod'
import { TicketStatusSchema } from './api'

export const RefinementEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), ticketId: z.string(), message: z.string() }),
  z.object({ type: z.literal('question'), ticketId: z.string(), question: z.string() }),
  z.object({ type: z.literal('status'), ticketId: z.string(), status: TicketStatusSchema }),
])
export type RefinementEvent = z.infer<typeof RefinementEventSchema>
