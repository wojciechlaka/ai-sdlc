import type { SourceTicket } from '../domain/types'
import { compareTicketKeys } from '../domain/ticketKey'
import type { TicketSource } from '../ports'

/** Ticket source whose tickets a test sets directly; `list` returns them in key order. */
export class FakeTicketSource implements TicketSource {
  /** Tickets of the source; `list` returns copies. */
  tickets: SourceTicket[] = []

  list(): SourceTicket[] {
    return this.tickets.map((t) => ({ ...t })).sort((a, b) => compareTicketKeys(a.key, b.key))
  }
}
