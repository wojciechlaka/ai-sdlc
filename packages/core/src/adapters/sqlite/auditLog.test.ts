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
    const started = { runId: 'a', stage: 'plan', trigger: 'initial', model: 'm' } as const
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'run_started', payload: started })
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'run_started', payload: started })
    audit.append({ ticketKey: 'CB-1', actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' } })

    const entries = audit.listForTicket('CB-1')
    expect(entries.map((e) => e.type)).toEqual(['run_started', 'question_asked'])
    expect(entries[1]).toMatchObject({ ticketKey: 'CB-1', actor: 'agent', payload: { question: 'Wer?' } })
    expect(entries[1]?.createdAt).toBeInstanceOf(Date)
  })

  it('stores the payload as JSON', () => {
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'cleanup', payload: { prNumber: 4, branch: 'CB-2/intent' } })
    expect(audit.listForTicket('CB-2')[0]?.payload).toEqual({ prNumber: 4, branch: 'CB-2/intent' })
  })

  it('removes entries with the ticket', () => {
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'error', payload: { message: 'x' } })
    tickets.clear()
    expect(audit.listForTicket('CB-1')).toEqual([])
  })
})
