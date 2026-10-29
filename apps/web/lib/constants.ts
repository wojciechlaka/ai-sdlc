import type { ArtifactStage, Stage, TicketDto, TicketState } from '@refinement/shared'

/** Board column and badge label per stage. */
export const STAGE_LABEL: Record<Stage, string> = {
  plan:   '1 Plan',
  design: '2 Design',
  done:   'Fertig',
}

/** Card title of an artifact stage on the ticket page: stage and artifact name. */
export const ARTIFACT_STAGE_TITLE: Record<ArtifactStage, string> = {
  plan:   '1 Plan · Intent',
  design: '2 Design · Spec',
}

/** Badge text per ticket state. */
export const STATE_LABEL: Record<TicketState, string> = {
  ready:           'bereit',
  running:         'Agent läuft',
  awaiting_answer: 'Rückfrage',
  in_review:       'in Review',
  failed:          'fehlgeschlagen',
}

/** Badge style per ticket state. */
export const STATE_VARIANT: Record<TicketState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ready:           'outline',
  running:         'secondary',
  awaiting_answer: 'default',
  in_review:       'default',
  failed:          'destructive',
}

/** State label; in review it names the PR. */
export function stateText(ticket: Pick<TicketDto, 'state' | 'openPr'>): string {
  return ticket.state === 'in_review' && ticket.openPr ? `in Review: PR #${ticket.openPr.number}` : STATE_LABEL[ticket.state]
}
