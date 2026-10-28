import type { Ticket } from '../domain/types'
import type { TicketRepository } from '../ports'
import { parseTicketId } from '../domain/ticketId'
import { NotFoundError } from '../domain/errors'

/**
 * Resolves a public ticket id (`T-{n}`) to the ticket.
 * @throws {NotFoundError} for malformed or unknown ids.
 */
export function requireTicket(tickets: TicketRepository, publicId: string): Ticket {
  let id: number
  try {
    id = parseTicketId(publicId)
  } catch {
    throw new NotFoundError(`Ticket ${publicId} not found`)
  }
  const ticket = tickets.findById(id)
  if (!ticket) throw new NotFoundError(`Ticket ${publicId} not found`)
  return ticket
}
