import type { AuditLogEntryDto, PullRequestRefDto, TicketDto } from '@refinement/shared'
import type { Artifact, Ticket } from '../domain/types'
import type { AuditLogEntry } from '../ports'

/** PR number, link and state of an artifact for the UI. */
export function toPullRequestRef(artifact: Artifact): PullRequestRefDto {
  return { number: artifact.prNumber, url: artifact.prUrl, state: artifact.prState }
}

/**
 * @param openArtifact - Artifact of the current stage whose PR is still open.
 * @param totalCostUsd - Agent cost of the ticket over all stages (`summarizeCosts(...).totalUsd`).
 */
export function toTicketDto(ticket: Ticket, openArtifact: Artifact | null, totalCostUsd: number): TicketDto {
  return {
    key: ticket.key,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    sourcePath: ticket.sourcePath,
    stage: ticket.stage,
    state: ticket.state,
    openPr: openArtifact ? toPullRequestRef(openArtifact) : null,
    updatedAt: ticket.updatedAt,
    totalCostUsd,
  }
}

/** The ticket key is implied by the page and therefore omitted. */
export function toAuditLogEntryDto(entry: AuditLogEntry): AuditLogEntryDto {
  return { actor: entry.actor, type: entry.type, payload: entry.payload, createdAt: entry.createdAt }
}
