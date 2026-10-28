import { z } from 'zod'
import { StageSchema, TicketStateSchema } from './stages'

/** Live events from the core to open browser tabs (SSE). */
export const TicketEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), ticketKey: z.string(), message: z.string() }),
  z.object({ type: z.literal('question'), ticketKey: z.string(), question: z.string() }),
  z.object({ type: z.literal('state'), ticketKey: z.string(), stage: StageSchema, state: TicketStateSchema }),
])
export type TicketEvent = z.infer<typeof TicketEventSchema>
