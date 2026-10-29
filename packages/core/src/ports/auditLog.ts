import type { AuditActor, AuditEventType, AuditPayloads } from '@refinement/shared'

export type { AuditActor, AuditEventType, AuditPayloads }

/** `true` when `T` is a union of several members (distributes over `T`, compares each member with the whole). */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

/**
 * Payload of the entry type `T`. `never` when `T` is a union of types: a payload of one
 * member must not pass for another (`AuditPayloads[T]` alone would accept any member's payload).
 */
export type PayloadOf<T extends AuditEventType> = true extends IsUnion<T> ? never : AuditPayloads[T]

/** A new log entry; `payload` must match `type` (contract in `packages/shared/src/auditEvents.ts`). */
export interface NewAuditEvent<T extends AuditEventType> {
  /** Ticket whose log the entry belongs to. */
  ticketKey: string
  /** Who caused the entry: human, agent or system. */
  actor: AuditActor
  /** Entry type; selects the payload shape. */
  type: T
  /** Data of the entry; German texts where it is shown verbatim. */
  payload: PayloadOf<T>
}

/** A stored log entry. Type and payload stay loose: rows written by older versions may not match the contract. */
export interface AuditLogEntry {
  /** Ticket whose log the entry belongs to. */
  ticketKey: string
  /** Who caused the entry: human, agent or system. */
  actor: AuditActor
  /** Entry type as stored; may be unknown to this version. */
  type: string
  /** Stored JSON payload; parse it with `AuditEventSchema` before use. */
  payload: unknown
  /** When the entry was written (millisecond precision; equal times keep insertion order). */
  createdAt: Date
}

/** Persistent log per ticket. */
export interface AuditLog {
  /** Appends one entry; the payload type follows from `type`, so a wrong payload does not compile. */
  append<T extends AuditEventType>(event: NewAuditEvent<T>): void
  /** Entries of one ticket, oldest first. */
  listForTicket(ticketKey: string): AuditLogEntry[]
}
