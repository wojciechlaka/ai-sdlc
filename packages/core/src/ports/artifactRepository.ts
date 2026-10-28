import type { Artifact, ArtifactStage } from '../domain/types'

export interface ArtifactRepository {
  /** Records a freshly opened PR (`prState: open`). */
  create(input: {
    ticketKey: string
    stage: ArtifactStage
    path: string
    branch: string
    prNumber: number
    prUrl: string
  }): Artifact
  /** All artifacts of a ticket, oldest first. */
  listForTicket(ticketKey: string): Artifact[]
  /** The newest artifact of the stage whose PR is still open. */
  findOpen(ticketKey: string, stage: ArtifactStage): Artifact | null
  markMerged(id: string, mergedAt: Date): void
  markClosed(id: string): void
}
