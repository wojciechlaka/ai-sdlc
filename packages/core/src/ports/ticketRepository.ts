import type { SourceTicket, Stage, Ticket, TicketState } from '../domain/types'

export interface TicketRepository {
  /** All tickets ordered by key (CB-2 before CB-10). */
  list(): Ticket[]
  findByKey(key: string): Ticket | null
  /**
   * Inserts unknown tickets as `plan/ready`; updates title, description, priority and source path
   * of known ones and keeps their stage and state.
   * @returns The keys that were inserted.
   */
  upsertFromSource(items: readonly SourceTicket[]): string[]
  /** @throws if the ticket does not exist. */
  update(key: string, patch: { stage?: Stage; state?: TicketState }): Ticket
  /** Deletes all tickets with their runs, artifacts and log entries. */
  clear(): void
}
