import type { Stage, TicketDto, TicketState } from '@refinement/shared'

export const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const STAGE_LABEL: Record<Stage, string> = {
  plan:   '1 Plan',
  design: '2 Design',
  done:   'Fertig',
}

export const STATE_LABEL: Record<TicketState, string> = {
  ready:           'bereit',
  running:         'Agent läuft',
  awaiting_answer: 'Rückfrage',
  in_review:       'in Review',
  failed:          'fehlgeschlagen',
}

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

// Anthropic provides no pricing API — values must be updated manually.
// Last verified: 2026-06-26 — https://docs.anthropic.com/en/docs/about-claude/pricing
export const MODEL_PRICING: Record<string, { inputPerMtok: number; outputPerMtok: number }> = {
  'claude-haiku-4-5-20251001': { inputPerMtok: 1.00,  outputPerMtok:  5.00 },
  'claude-sonnet-4-6':         { inputPerMtok: 3.00,  outputPerMtok: 15.00 },
  'claude-opus-4-7':           { inputPerMtok: 5.00,  outputPerMtok: 25.00 },
}

export const MTOK = 1_000_000
export const CACHE_WRITE_MULTIPLIER = 1.25
export const CACHE_READ_MULTIPLIER = 0.10
