import type { AuditActor, AuditEventType, AuditPayloads } from '@refinement/shared'

export type { AuditActor, AuditEventType, AuditPayloads }

/** `true` when `T` is a union of several members (distributes over `T`, compares each member with the whole). */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

/**
 * Payload of the entry type `T`, inferred from `type` only. `never` when `T` is a union of types: a payload of one
 * member must not pass for another (`AuditPayloads[T]` alone would accept any member's payload).
 */
export type PayloadOf<T extends AuditEventType> = NoInfer<true extends IsUnion<T> ? never : AuditPayloads[T]>

/** A new log entry; `payload` must match `type` (contract in `packages/shared/src/auditEvents.ts`). */
export interface NewAuditEvent<T extends AuditEventType> {
  ticketKey: string
  actor: AuditActor
  type: T
  payload: PayloadOf<T>
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
