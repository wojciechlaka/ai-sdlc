import type { TicketEvent } from '@refinement/shared'

/** In-process bus of ticket events; the SSE route forwards them to the browser. */
export interface EventPublisher {
  /** Delivers the event to the subscribers of its ticket and to those of all tickets. */
  publish(event: TicketEvent): void
  /** Subscribes to the events of one ticket, or of all tickets with `null`. Returns the unsubscribe function. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
}
