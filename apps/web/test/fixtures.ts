import type { AuditEventDto, TicketDetailDto, TicketDto } from '@refinement/shared'

/** Fixed timestamp of all fixtures, so rendered dates are stable. */
export const FIXTURE_DATE = new Date('2026-10-28T10:00:00Z')

/** A `ready` ticket in stage `plan`; title and source path follow the key unless patched. */
export function aTicket(patch: Partial<TicketDto> = {}): TicketDto {
  const key = patch.key ?? 'CB-2'
  return {
    key, title: `Titel ${key}`, description: 'D', priority: 'Mittel', sourcePath: `examples/tickets/${key}.md`,
    stage: 'plan', state: 'ready', openPr: null, updatedAt: FIXTURE_DATE, ...patch,
  }
}

/** `aTicket` plus the detail fields of the ticket page: no stages, empty log, no open question. */
export function aTicketDetail(patch: Partial<TicketDetailDto> = {}): TicketDetailDto {
  return { ...aTicket(patch), stages: [], log: [], pendingQuestion: null, ...patch }
}

/** One log entry of the ticket page, written by `actor` (system by default). */
export function anAuditEvent(type: string, payload: unknown, actor: AuditEventDto['actor'] = 'system'): AuditEventDto {
  return { actor, type, payload, createdAt: FIXTURE_DATE }
}
