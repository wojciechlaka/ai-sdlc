import type { TicketStatus } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'
import type { UseCaseDeps } from './deps'

/** Per-ticket helpers that keep logging, events and status changes consistent. */
export interface Reporter {
  /** Server log line only. */
  log(message: string): void
  /** Progress event only. */
  progress(message: string): void
  /** Server log line plus progress event. */
  report(message: string): void
  /** Persists the status and publishes a status event. */
  setStatus(status: TicketStatus): void
  question(question: string): void
}

export function createReporter(deps: Pick<UseCaseDeps, 'tickets' | 'events'>, ticketId: number): Reporter {
  const publicId = formatTicketId(ticketId)
  const log = (message: string) => console.log(`[${new Date().toISOString()}] [${publicId}] ${message}`)
  const progress = (message: string) => deps.events.publish({ type: 'progress', ticketId: publicId, message })

  return {
    log,
    progress,
    report: (message) => {
      log(message)
      progress(message)
    },
    setStatus: (status) => {
      deps.tickets.updateStatus(ticketId, status)
      deps.events.publish({ type: 'status', ticketId: publicId, status })
    },
    question: (question) => deps.events.publish({ type: 'question', ticketId: publicId, question }),
  }
}
