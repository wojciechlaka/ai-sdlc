import { eq } from 'drizzle-orm'
import { db } from './client'
import { auditEvents } from './schema'

export type AuditEventRow = typeof auditEvents.$inferSelect

/**
 * Appends an immutable audit event for a ticket. Caller supplies actor, event type, and optional payload.
 * @param input - Actor, event type, ticket ID, and optional JSON payload.
 */
export function appendAuditEvent(input: {
  ticketId: number
  actor: 'human' | 'agent' | 'system'
  type: string
  payload?: unknown
}): void {
  db.insert(auditEvents).values({
    ticketId: input.ticketId,
    actor: input.actor,
    type: input.type,
    payload: input.payload ?? null,
  }).run()
}

/**
 * Returns all audit events for a ticket in insertion order.
 * @param ticketId - Numeric ticket ID.
 */
export function getEventsForTicket(ticketId: number): AuditEventRow[] {
  return db.select().from(auditEvents).where(eq(auditEvents.ticketId, ticketId)).all()
}
