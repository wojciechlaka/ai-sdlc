import type { AuditEventDto, PullRequestRefDto, TicketDto } from '@refinement/shared'
import type { Artifact, Ticket } from '../domain/types'
import type { AuditEvent } from '../ports'

export function toPullRequestRef(artifact: Artifact): PullRequestRefDto {
  return { number: artifact.prNumber, url: artifact.prUrl, state: artifact.prState }
}

/** @param openArtifact - Artifact of the current stage whose PR is still open. */
export function toTicketDto(ticket: Ticket, openArtifact: Artifact | null): TicketDto {
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
  }
}

/** The ticket key is implied by the page and therefore omitted. */
export function toAuditEventDto(event: AuditEvent): AuditEventDto {
  return { actor: event.actor, type: event.type, payload: event.payload, createdAt: event.createdAt }
}
