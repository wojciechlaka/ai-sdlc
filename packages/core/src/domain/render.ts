import type { Intent } from '@refinement/shared'
import type { ArtifactStage, QAPair, Ticket } from './types'
import { artifactTitle } from './artifacts'

const NONE = 'Keine.'

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : NONE
}

function answeredQuestions(pairs: QAPair[]): string {
  return pairs.length ? pairs.map((p) => `**F:** ${p.question}\n**A:** ${p.answer}`).join('\n\n') : NONE
}

/**
 * Markdown of `docs/work/<KEY>/intent.md`. The front matter identifies the ticket only;
 * state stays in the platform database.
 */
export function renderIntent(ticket: Pick<Ticket, 'key' | 'sourcePath'>, intent: Intent, answered: QAPair[]): string {
  return [
    '---',
    `ticket: ${ticket.key}`,
    'stage: plan',
    `source: ${ticket.sourcePath}`,
    '---',
    '',
    `# ${ticket.key}: ${intent.title}`,
    '',
    '## Problem',
    '',
    intent.problem.trim(),
    '',
    '## Gewünschtes Ergebnis',
    '',
    intent.desiredOutcome.trim(),
    '',
    '## Betroffene',
    '',
    bulletList(intent.affected),
    '',
    '## Offene Punkte',
    '',
    bulletList(intent.openPoints.map((p) => p.question)),
    '',
    '## Geklärte Rückfragen',
    '',
    answeredQuestions(answered),
    '',
  ].join('\n')
}

/** Description of the stage PR: what it contains and that the merge is the gate. */
export function renderPullRequestBody(
  ticket: Pick<Ticket, 'key' | 'title' | 'sourcePath'>,
  stage: ArtifactStage,
  summary: string,
): string {
  return [
    `**${artifactTitle(ticket.key, stage)}** für „${ticket.title}“`,
    '',
    summary.trim(),
    '',
    `Quelle: \`${ticket.sourcePath}\``,
    '',
    '---',
    'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
  ].join('\n')
}
