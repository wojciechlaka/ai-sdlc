import type { TicketDetailDto, TicketDto } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { toAgentRunDto, toTicketDto } from './dto'
import { requireTicket } from './requireTicket'

export function listTickets(deps: UseCaseDeps): TicketDto[] {
  return deps.tickets.list().map(toTicketDto)
}

export function getTicket(deps: UseCaseDeps, ticketId: string): TicketDetailDto {
  const ticket = requireTicket(deps.tickets, ticketId)
  const latestRun = deps.runs.latestForTicket(ticket.id)
  return { ...toTicketDto(ticket), latestRun: latestRun ? toAgentRunDto(latestRun) : null }
}
