import type { SettingsDto, TicketDetailDto, TicketDto, TicketEvent } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { getSettings, getTicket, listTickets } from './queries'
import { answerQuestion, startStage, stopRun } from './stageCommands'
import { syncReviews } from './syncReviews'
import { resetSystem, startup } from './startup'

/**
 * Everything a driving adapter (Next.js) may call.
 * Inputs typed `unknown` are validated inside; domain errors carry `code` (see `errorCode`).
 */
export interface UseCases {
  listTickets(): TicketDto[]
  getTicket(key: string): Promise<TicketDetailDto>
  getSettings(): SettingsDto
  startStage(key: string, input: unknown): void
  answerQuestion(key: string, input: unknown): void
  stopRun(key: string): void
  /** Checks the PRs of tickets in review — all, or the one given. */
  syncReviews(key?: string): Promise<void>
  resetSystem(): Promise<void>
  /** Events of one ticket, or of all tickets with `null`. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
  startup(): Promise<void>
}

export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    listTickets: () => listTickets(deps),
    getTicket: (key) => getTicket(deps, key),
    getSettings: () => getSettings(deps),
    startStage: (key, input) => startStage(deps, key, input),
    answerQuestion: (key, input) => answerQuestion(deps, key, input),
    stopRun: (key) => stopRun(deps, key),
    syncReviews: (key) => syncReviews(deps, key),
    resetSystem: () => resetSystem(deps),
    subscribe: (ticketKey, handler) => deps.events.subscribe(ticketKey, handler),
    startup: () => startup(deps),
  }
}
