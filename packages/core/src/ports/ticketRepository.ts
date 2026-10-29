import type { Ticket, TicketStatus } from '../domain/types'

export interface TicketRepository {
  list(): Ticket[]
  findById(id: number): Ticket | null
  count(): number
  create(input: { title: string; description: string }): Ticket
  /** Throws if the ticket does not exist. */
  updateStatus(id: number, status: TicketStatus): void
  /** Throws if the ticket does not exist. Runs and audit events are removed with it. */
  delete(id: number): void
  /** Deletes all tickets (with their runs and events) and inserts the given ones. */
  replaceAll(tickets: ReadonlyArray<{ title: string; description: string }>): Ticket[]
}
