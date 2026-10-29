import type { AuditLogEntryDto, CostSummaryDto, StageCostDto, TicketDetailDto, TicketDto } from '@refinement/shared'

/** Fixed timestamp of all fixtures, so rendered dates are stable. */
export const FIXTURE_DATE = new Date('2026-10-28T10:00:00Z')

/** A `ready` ticket in stage `plan`; title and source path follow the key unless patched. */
export function aTicket(patch: Partial<TicketDto> = {}): TicketDto {
  const key = patch.key ?? 'CB-2'
  return {
    key, title: `Titel ${key}`, description: 'D', priority: 'Mittel', sourcePath: `examples/tickets/${key}.md`,
    stage: 'plan', state: 'ready', openPr: null, updatedAt: FIXTURE_DATE, totalCostUsd: 0, ...patch,
  }
}

/** Cost of a stage without runs. */
export const NO_STAGE_COST: StageCostDto = { usd: 0, runs: 0, inputTokens: 0, outputTokens: 0 }

/** Cost summary of a ticket without runs; patch it for stages with cost. */
export function aCostSummary(patch: Partial<CostSummaryDto> = {}): CostSummaryDto {
  return {
    totalUsd: 0, runs: 0, inputTokens: 0, outputTokens: 0, byStage: { plan: NO_STAGE_COST, design: NO_STAGE_COST }, ...patch,
  }
}

/** `aTicket` plus the detail fields of the ticket page: no stages, empty log, no open question, no cost. */
export function aTicketDetail(patch: Partial<TicketDetailDto> = {}): TicketDetailDto {
  return { ...aTicket(patch), stages: [], log: [], pendingQuestion: null, costs: aCostSummary(), ...patch }
}

/** One log entry of the ticket page, written by `actor` (system by default). */
export function aLogEntry(type: string, payload: unknown, actor: AuditLogEntryDto['actor'] = 'system'): AuditLogEntryDto {
  return { actor, type, payload, createdAt: FIXTURE_DATE }
}
