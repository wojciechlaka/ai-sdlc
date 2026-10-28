import type { RefinementEvent } from '@refinement/shared'

export interface EventPublisher {
  publish(event: RefinementEvent): void
  /** Subscribes to all events of one ticket. Returns the unsubscribe function. */
  subscribe(ticketId: string, handler: (event: RefinementEvent) => void): () => void
}
