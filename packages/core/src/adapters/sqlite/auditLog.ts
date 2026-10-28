import { eq, sql } from 'drizzle-orm'
import type { AuditLog } from '../../ports'
import type { SqliteDb } from './database'
import { auditEvents } from './schema'

export function createSqliteAuditLog(db: SqliteDb): AuditLog {
  return {
    append(event) {
      db.insert(auditEvents).values({
        ticketKey: event.ticketKey,
        actor: event.actor,
        type: event.type,
        payload: event.payload ?? null,
      }).run()
    },

    listForTicket: (ticketKey) =>
      db.select({
        ticketKey: auditEvents.ticketKey,
        actor: auditEvents.actor,
        type: auditEvents.type,
        payload: auditEvents.payload,
        createdAt: auditEvents.createdAt,
      })
        .from(auditEvents)
        .where(eq(auditEvents.ticketKey, ticketKey))
        // Insertion order; `created_at` has only second precision.
        .orderBy(sql`rowid`)
        .all(),
  }
}
