import type { AgentRunDto, TicketDetailDto, TicketDto } from '@refinement/shared'
import { NotFoundError } from '../domain/errors'
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

export function getRun(deps: UseCaseDeps, runId: string): AgentRunDto {
  const run = deps.runs.findById(runId)
  if (!run) throw new NotFoundError(`Run ${runId} not found`)
  return toAgentRunDto(run)
}
