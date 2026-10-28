export type AuditActor = 'human' | 'agent' | 'system'

export type AuditEventType =
  | 'ticket_imported'
  | 'run_started'
  | 'run_finished'
  | 'question_asked'
  | 'answer_given'
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  | 'stage_changed'
  | 'cleanup'
  | 'error'

export interface AuditEvent {
  ticketKey: string
  actor: AuditActor
  type: AuditEventType
  payload: unknown
  createdAt: Date
}

/** Persistent log per ticket. */
export interface AuditLog {
  append(event: { ticketKey: string; actor: AuditActor; type: AuditEventType; payload?: unknown }): void
  /** Entries of one ticket, oldest first. */
  listForTicket(ticketKey: string): AuditEvent[]
}
