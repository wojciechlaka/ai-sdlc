import type { Intent, Spec } from '@refinement/shared'
import type { ArtifactStage, QAPair, Ticket } from './types'
import { artifactPath, artifactTitle } from './artifacts'

const NONE = 'Keine.'

/** Collapses whitespace so a single-line field cannot break Markdown structure. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${demoteHeadings(oneLine(item))}`).join('\n') : NONE
}

/** Keeps a `#` at the start of a line from becoming a heading: agent text must not add sections. */
function demoteHeadings(text: string): string {
  return text.replace(/^(\s*)#/gm, '$1\\#')
}

/** A multi-line text field: trimmed, headings demoted, `Keine.` when empty. */
function textBlock(text: string): string {
  return demoteHeadings(text.trim()) || NONE
}

/** Code span that survives backticks in the content (longer fence, padded). */
function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return longest > 0 ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`
}

function qaList(pairs: QAPair[]): string {
  return pairs.length ? pairs.map((p) => `**F:** ${oneLine(p.question)}\\\n**A:** ${oneLine(p.answer)}`).join('\n\n') : NONE
}

/**
 * Markdown of `docs/work/<KEY>/intent.md`. The front matter identifies the ticket only;
 * state stays in the platform database.
 */
export function renderIntent(ticket: Pick<Ticket, 'key' | 'sourcePath'>, intent: Intent, answeredQuestions: QAPair[]): string {
  return [
    '---',
    `ticket: ${ticket.key}`,
    'stage: plan',
    `source: ${ticket.sourcePath}`,
    '---',
    '',
    `# ${ticket.key}: ${oneLine(intent.title)}`,
    '',
    '## Problem',
    '',
    textBlock(intent.problem),
    '',
    '## Gewünschtes Ergebnis',
    '',
    textBlock(intent.desiredOutcome),
    '',
    '## Erfolgskriterien',
    '',
    bulletList(intent.successCriteria),
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
    qaList(answeredQuestions),
    '',
  ].join('\n')
}

const SEVERITY_LABEL: Record<Spec['risks'][number]['severity'], string> = { high: 'hoch', medium: 'mittel', low: 'niedrig' }

function alternativesList(alternatives: Spec['approach']['alternatives']): string {
  return bulletList(alternatives.map((alt) => `**${oneLine(alt.name)}** — ${oneLine(alt.reason)}`))
}

function componentsList(components: Spec['components']): string {
  if (!components.length) {
    return NONE
  }
  return components.map((component) => [
    `### ${oneLine(component.name)}`,
    '',
    `- **Zweck:** ${oneLine(component.purpose)}`,
    `- **Schnittstelle:** ${oneLine(component.interface)}`,
    `- **Abhängigkeiten:** ${component.dependsOn.length ? component.dependsOn.map(oneLine).join(', ') : NONE}`,
  ].join('\n')).join('\n\n')
}

function affectedFilesList(files: Spec['affectedFiles']): string {
  return bulletList(files.map((file) => {
    const path = codeSpan(oneLine(file.path))
    return `${path}${file.isNew ? ' (neu)' : ''} — ${oneLine(file.change)}`
  }))
}

function risksList(risks: Spec['risks']): string {
  return bulletList(risks.map((risk) => {
    const severity = SEVERITY_LABEL[risk.severity]
    return `[${severity}] ${oneLine(risk.description)} — ${oneLine(risk.mitigation)}`
  }))
}

/**
 * Markdown of `docs/work/<KEY>/spec.md`. The front matter identifies the ticket and the intent it is based on;
 * state stays in the platform database. Every section is always present; empty ones read „Keine.“.
 */
export function renderSpec(ticket: Pick<Ticket, 'key' | 'sourcePath'>, spec: Spec, answeredQuestions: QAPair[]): string {
  return [
    '---',
    `ticket: ${ticket.key}`,
    'stage: design',
    `source: ${ticket.sourcePath}`,
    `intent: ${artifactPath(ticket.key, 'plan')}`,
    '---',
    '',
    `# ${ticket.key}: ${oneLine(spec.title)}`,
    '',
    '## Ziel',
    '',
    textBlock(spec.goal),
    '',
    '## Gewählter Ansatz',
    '',
    textBlock(spec.approach.chosen),
    '',
    `**Begründung:** ${textBlock(spec.approach.rationale)}`,
    '',
    '**Verworfene Alternativen:**',
    '',
    alternativesList(spec.approach.alternatives),
    '',
    '## Architektur und Komponenten',
    '',
    componentsList(spec.components),
    '',
    '## Datenfluss',
    '',
    textBlock(spec.dataFlow),
    '',
    '## Fehlerbehandlung',
    '',
    textBlock(spec.errorHandling),
    '',
    '## Akzeptanzkriterien',
    '',
    bulletList(spec.acceptanceCriteria),
    '',
    '## Tests',
    '',
    textBlock(spec.tests),
    '',
    '## Betroffene Dateien',
    '',
    affectedFilesList(spec.affectedFiles),
    '',
    '## Risiken',
    '',
    risksList(spec.risks),
    '',
    '## Offene Punkte',
    '',
    bulletList(spec.openPoints.map((p) => p.question)),
    '',
    '## Geklärte Rückfragen',
    '',
    qaList(answeredQuestions),
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
