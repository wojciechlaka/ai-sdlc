import type { SourceTicket } from '../domain/types'

/** Where raw tickets come from (Jira in production; Markdown files in the showcase). */
export interface TicketSource {
  /** All tickets, ordered by key. Malformed entries are skipped. */
  list(): SourceTicket[]
}
