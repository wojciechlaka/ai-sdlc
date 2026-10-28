import type { TicketEvent } from '@refinement/shared'

export interface EventPublisher {
  publish(event: TicketEvent): void
  /** Subscribes to the events of one ticket, or of all tickets with `null`. Returns the unsubscribe function. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
}
