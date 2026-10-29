import { z } from 'zod'
import { StageSchema, TicketStateSchema } from './stages'

/** Live events from the core to open browser tabs (SSE). */
export const TicketEventSchema = z.discriminatedUnion('type', [
  /** Short status text of a running agent; feeds the live log. */
  z.object({ type: z.literal('progress'), ticketKey: z.string(), message: z.string() }),
  /** The agent asked a question; the page refreshes to show it. */
  z.object({ type: z.literal('question'), ticketKey: z.string(), question: z.string() }),
  /** Stage or state changed; board and ticket page refresh. */
  z.object({ type: z.literal('state'), ticketKey: z.string(), stage: StageSchema, state: TicketStateSchema }),
])
export type TicketEvent = z.infer<typeof TicketEventSchema>
