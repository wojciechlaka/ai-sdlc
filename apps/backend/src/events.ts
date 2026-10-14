import { EventEmitter } from 'events'
import type { TicketStatus } from './db/schema'

/** Emitted when the Claude agent asks the human a clarifying question. */
export interface QuestionEvent {
  ticketId: string
  question: string
}

/** Emitted when a ticket's refinement status changes. */
export interface StatusEvent {
  ticketId: string
  status: TicketStatus
}

/** Emitted for incremental log/progress messages from the Claude agent. */
export interface ProgressEvent {
  ticketId: string
  message: string
}

/** Central event bus for all refinement lifecycle events. */
export const refinementEvents = new EventEmitter()
