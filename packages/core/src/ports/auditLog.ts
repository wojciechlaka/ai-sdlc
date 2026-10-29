import type { AuditActor, AuditEventType, AuditPayloads } from '@refinement/shared'

export type { AuditActor, AuditEventType, AuditPayloads }

/** A new log entry; `payload` must match `type` (contract in `packages/shared/src/auditEvents.ts`). */
export interface NewAuditEvent<T extends AuditEventType> {
  ticketKey: string
  actor: AuditActor
  type: T
  payload: AuditPayloads[T]
}

/** A stored log entry. Type and payload stay loose: rows written by older versions may not match the contract. */
export interface AuditLogEntry {
  ticketKey: string
  actor: AuditActor
  type: string
  payload: unknown
  createdAt: Date
}

/** Persistent log per ticket. */
export interface AuditLog {
  /** Appends one entry; the payload type follows from `type`, so a wrong payload does not compile. */
  append<T extends AuditEventType>(event: NewAuditEvent<T>): void
  /** Entries of one ticket, oldest first. */
  listForTicket(ticketKey: string): AuditLogEntry[]
}
