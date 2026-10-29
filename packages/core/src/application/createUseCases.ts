import type { RefinementEvent, TicketDetailDto, TicketDto } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { getTicket, listTickets } from './queries'
import { answerQuestion, createTicket, deleteTicket, resetSystem, startRefinement, stopRefinement } from './commands'
import { startup } from './startup'

/**
 * Everything a driving adapter (Next.js) may call.
 * Inputs typed `unknown` are validated inside; domain errors carry `code` (see `errorCode`).
 */
export interface UseCases {
  listTickets(): TicketDto[]
  getTicket(ticketId: string): TicketDetailDto
  createTicket(input: unknown): TicketDto
  startRefinement(ticketId: string, input: unknown): void
  answerQuestion(ticketId: string, input: unknown): void
  stopRefinement(ticketId: string): Promise<void>
  deleteTicket(ticketId: string): void
  resetSystem(): Promise<TicketDto[]>
  subscribeToTicket(ticketId: string, handler: (event: RefinementEvent) => void): () => void
  startup(): void
}

export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    listTickets: () => listTickets(deps),
    getTicket: (ticketId) => getTicket(deps, ticketId),
    createTicket: (input) => createTicket(deps, input),
    startRefinement: (ticketId, input) => startRefinement(deps, ticketId, input),
    answerQuestion: (ticketId, input) => answerQuestion(deps, ticketId, input),
    stopRefinement: (ticketId) => stopRefinement(deps, ticketId),
    deleteTicket: (ticketId) => deleteTicket(deps, ticketId),
    resetSystem: () => resetSystem(deps),
    subscribeToTicket: (ticketId, handler) => deps.events.subscribe(ticketId, handler),
    startup: () => startup(deps),
  }
}
