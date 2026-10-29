import type { SettingsDto, TicketDetailDto, TicketDto, TicketEvent } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { getSettings, getTicket, listTickets } from './queries'
import { answerQuestion, startStage, stopRun } from './stageCommands'
import { syncReviews } from './syncReviews'
import { resetSystem, startup, type StartupOptions, type StartupReport } from './startup'

/**
 * Everything a driving adapter (Next.js) may call.
 * Inputs typed `unknown` are validated inside; domain errors carry `code` (see `errorCode`).
 */
export interface UseCases {
  /** All tickets for the board, in key order. */
  listTickets(): TicketDto[]
  /** Ticket page data: ticket, stage views with content from the base branch, log. @throws NotFoundError */
  getTicket(key: string): Promise<TicketDetailDto>
  /** Repo, base branch, baseline tag and whether a token is configured. */
  getSettings(): SettingsDto
  /** Starts the ticket's current stage with `{ model }`; the agent runs in the background. */
  startStage(key: string, input: unknown): void
  /** Answers the open question with `{ answer }` and starts the next run of the stage. */
  answerQuestion(key: string, input: unknown): void
  /** Ends the running attempt (or the open question); the ticket goes back to `ready`. */
  stopRun(key: string): void
  /** Checks the PRs of tickets in review — all, or the one given. */
  syncReviews(key?: string): Promise<void>
  /** Empties the database and starts again with a repo reset; returns the warnings of the start. */
  resetSystem(): Promise<StartupReport>
  /** Events of one ticket, or of all tickets with `null`. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
  /** Start of the app: import tickets, clean up, sync with GitHub; never throws, returns warnings. */
  startup(options?: StartupOptions): Promise<StartupReport>
}

/** Binds every use case to `deps`; `compose.ts` calls it with the real adapters, tests with fakes. */
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
    startup: (options) => startup(deps, options),
  }
}
