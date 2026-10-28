import type { Ticket } from '../domain/types'
import type { TicketRepository } from '../ports'
import { NotFoundError } from '../domain/errors'

/**
 * Resolves a ticket key from a URL or action; case-insensitive (`cb-3` → `CB-3`).
 * @throws {NotFoundError} for unknown keys.
 */
export function requireTicket(tickets: TicketRepository, key: string): Ticket {
  const ticket = tickets.findByKey(key.trim().toUpperCase())
  if (!ticket) throw new NotFoundError(`Ticket ${key} nicht gefunden`)
  return ticket
}
