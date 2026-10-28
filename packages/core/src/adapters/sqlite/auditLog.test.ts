import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAuditLog } from './auditLog'
import type { AuditLog, TicketRepository } from '../../ports'

let tickets: TicketRepository
let audit: AuditLog

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  audit = createSqliteAuditLog(db)
  tickets.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
})

describe('audit log', () => {
  it('lists the entries of one ticket in insertion order', () => {
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'run_started', payload: { runId: 'a' } })
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'run_started' })
    audit.append({ ticketKey: 'CB-1', actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' } })

    const entries = audit.listForTicket('CB-1')
    expect(entries.map((e) => e.type)).toEqual(['run_started', 'question_asked'])
    expect(entries[1]).toMatchObject({ ticketKey: 'CB-1', actor: 'agent', payload: { question: 'Wer?' } })
    expect(entries[1]?.createdAt).toBeInstanceOf(Date)
  })

  it('stores a missing payload as null', () => {
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'cleanup' })
    expect(audit.listForTicket('CB-2')[0]?.payload).toBeNull()
  })

  it('removes entries with the ticket', () => {
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'cleanup' })
    tickets.clear()
    expect(audit.listForTicket('CB-1')).toEqual([])
  })
})
