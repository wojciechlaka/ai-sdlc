import type { AgentRunDto, TicketDto } from '@refinement/shared'
import type { AgentRun, Ticket } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'

export function toTicketDto(ticket: Ticket): TicketDto {
  return {
    id: formatTicketId(ticket.id),
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    iteration: ticket.iteration,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }
}

/** The run `input` is internal (prompt snapshot) and intentionally not exposed. */
export function toAgentRunDto(run: AgentRun): AgentRunDto {
  return {
    id: run.id,
    ticketId: formatTicketId(run.ticketId),
    iteration: run.iteration,
    trigger: run.trigger,
    status: run.status,
    model: run.model,
    output: run.output,
    costUsd: run.costUsd,
    inputTokens: run.inputTokens,
    cacheCreationTokens: run.cacheCreationTokens,
    cacheReadTokens: run.cacheReadTokens,
    outputTokens: run.outputTokens,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}
