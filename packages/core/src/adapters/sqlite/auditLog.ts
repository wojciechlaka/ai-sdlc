import type { AuditLog } from '../../ports'
import type { SqliteDb } from './database'
import { auditEvents } from './schema'

export function createSqliteAuditLog(db: SqliteDb): AuditLog {
  return {
    append(event) {
      db.insert(auditEvents).values({
        ticketId: event.ticketId,
        actor: event.actor,
        type: event.type,
        payload: event.payload ?? null,
      }).run()
    },
  }
}
