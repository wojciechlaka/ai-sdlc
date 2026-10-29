import type { Stage, TicketState } from '../domain/types'
import type { UseCaseDeps } from './deps'

/** Per-ticket helpers that keep server log, events and state changes consistent. */
export interface Reporter {
  /** Server log line only. */
  log(message: string): void
  /** Progress event only. */
  progress(message: string): void
  /** Server log line plus progress event (the German progress text is logged unchanged). */
  logAndProgress(message: string): void
  /** Persists the state (and stage, if given) and publishes a state event. */
  setState(state: TicketState, stage?: Stage): void
  /** Publishes the agent's open question. */
  question(question: string): void
}

/** Reporter for one ticket; the server log lines carry timestamp and ticket key. */
export function createReporter(deps: Pick<UseCaseDeps, 'tickets' | 'events'>, ticketKey: string): Reporter {
  const log = (message: string) => console.log(`[${new Date().toISOString()}] [${ticketKey}] ${message}`)
  const progress = (message: string) => deps.events.publish({ type: 'progress', ticketKey, message })

  return {
    log,
    progress,
    logAndProgress: (message) => {
      log(message)
      progress(message)
    },
    setState: (state, stage) => {
      const ticket = deps.tickets.update(ticketKey, stage ? { stage, state } : { state })
      deps.events.publish({ type: 'state', ticketKey, stage: ticket.stage, state: ticket.state })
    },
    question: (question) => deps.events.publish({ type: 'question', ticketKey, question }),
  }
}
