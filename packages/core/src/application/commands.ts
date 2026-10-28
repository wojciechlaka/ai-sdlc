import { AnswerInput, CreateTicketInput, StartRefinementInput, type TicketDto } from '@refinement/shared'
import { ConflictError } from '../domain/errors'
import { canDelete, canStartRefinement, isAnswerInProgress } from '../domain/rules'
import { formatTicketId } from '../domain/ticketId'
import { SEED_TICKETS } from '../domain/seeds'
import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { toTicketDto } from './dto'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { runAnswer, runInitialRefinement } from './refinementJobs'
import { sleep } from './sleep'

export function createTicket(deps: UseCaseDeps, raw: unknown): TicketDto {
  const input = parseInput(CreateTicketInput, raw)
  const ticket = deps.tickets.create(input)
  deps.audit.append({ ticketId: ticket.id, actor: 'human', type: 'ticket_created', payload: null })
  return toTicketDto(ticket)
}

/** Validates, sets `refining` and hands the agent run to the background. Returns immediately. */
export function startRefinement(deps: UseCaseDeps, ticketId: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (!canStartRefinement(ticket)) throw new ConflictError('Ticket is not in a refineable state')
  const input = parseInput(StartRefinementInput, raw)

  createReporter(deps, ticket.id).setStatus('refining')
  deps.runInBackground(runInitialRefinement(deps, ticket, input))
}

/** Validates and continues the refinement with the answer in the background. Returns immediately. */
export function answerQuestion(deps: UseCaseDeps, ticketId: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (ticket.status !== 'refining') throw new ConflictError('Ticket is not awaiting an answer')
  if (isAnswerInProgress(deps.runs.latestForTicket(ticket.id))) throw new ConflictError('Answer already in progress')
  const { answer } = parseInput(AnswerInput, raw)

  deps.runInBackground(runAnswer(deps, ticket, answer))
}

/**
 * Stops the agent and, once it had time to exit, returns a still-refining ticket to backlog.
 * Unknown tickets are ignored (stop is idempotent).
 */
export async function stopRefinement(deps: UseCaseDeps, ticketId: string): Promise<void> {
  deps.agent.stop(ticketId)
  await sleep(deps.stopSettleMs)

  let ticket: Ticket
  try {
    ticket = requireTicket(deps.tickets, ticketId)
  } catch {
    return
  }
  if (ticket.status === 'refining') createReporter(deps, ticket.id).setStatus('backlog')
}

export function deleteTicket(deps: UseCaseDeps, ticketId: string): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (!canDelete(ticket)) throw new ConflictError('Cannot delete a ticket while refinement is running')
  deps.tickets.delete(ticket.id)
}

/** Stops all running agents and restores the three seed tickets. */
export async function resetSystem(deps: UseCaseDeps): Promise<TicketDto[]> {
  for (const ticket of deps.tickets.list()) {
    if (ticket.status === 'refining') deps.agent.stop(formatTicketId(ticket.id))
  }
  await sleep(deps.stopSettleMs)
  return deps.tickets.replaceAll(SEED_TICKETS).map(toTicketDto)
}
