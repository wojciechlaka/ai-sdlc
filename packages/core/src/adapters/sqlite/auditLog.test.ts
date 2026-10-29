import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAuditLog } from './auditLog'
import { auditEvents } from './schema'

describe('createSqliteAuditLog', () => {
  it('appends events with optional payload', () => {
    const db = createTestDatabase()
    const ticket = createSqliteTicketRepository(db).create({ title: 'T', description: 'D' })
    const audit = createSqliteAuditLog(db)

    audit.append({ ticketId: ticket.id, actor: 'human', type: 'ticket_created' })
    audit.append({ ticketId: ticket.id, actor: 'system', type: 'run_started', payload: { runId: 'r1' } })

    const rows = db.select().from(auditEvents).where(eq(auditEvents.ticketId, ticket.id)).all()
    expect(rows.map((r) => [r.actor, r.type, r.payload])).toEqual([
      ['human', 'ticket_created', null],
      ['system', 'run_started', { runId: 'r1' }],
    ])
  })
})
