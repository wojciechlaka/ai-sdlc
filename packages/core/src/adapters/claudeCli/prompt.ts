import type { QAPair } from '../../domain/types'
import { QUESTION_LIMIT } from '../../domain/rules'
import type { SchemaFailureReason } from './errors'

const MAX_RETRY_OUTPUT_CHARS = 3000

/** What the retry prompt needs from the rejected first output. */
export interface RetryContext {
  previousOutput: string
  reason: SchemaFailureReason
  /** Message of the SchemaValidationError, quoted to the agent. */
  schemaError: string
}

/** Everything one prompt is built from; `retryContext` turns it into a correction prompt. */
export interface PromptInput {
  skill: string
  ticketKey: string
  title: string
  description: string
  codebaseSummary?: string
  /** Merged intent of the ticket (design stage), quoted after the ticket. */
  intent?: string
  answeredQuestions: QAPair[]
  /** Questions and choices the agent may still ask; absent for a stage without limit (plan). */
  questionsRemaining?: number
  retryContext?: RetryContext
}

/**
 * Builds the full prompt for the Claude CLI: skill, ticket, intent (design), answered questions and the remaining
 * questions. With `retryContext` it becomes a correction prompt that quotes the malformed output.
 */
export function buildPrompt(input: PromptInput): string {
  const context = [...ticketSection(input), intentSection(input), answeredQuestionsSection(input), questionBudgetSection(input)]
  const parts = input.retryContext
    ? [input.skill, '---', ...context, correctionSection(input.retryContext)]
    : [input.skill, '---', summarySection(input), ...context]
  return parts.filter((part): part is string => Boolean(part)).join('\n\n')
}

function ticketSection(input: PromptInput): string[] {
  return [`Ticket: ${input.ticketKey}`, `# ${input.title}`, `## Beschreibung\n${input.description}`]
}

/** Omitted on retry: the agent already analysed the codebase. */
function summarySection(input: PromptInput): string | null {
  return input.codebaseSummary ? `## Codebase-Übersicht\n\n${input.codebaseSummary}\n\n---` : null
}

function intentSection(input: PromptInput): string | null {
  return input.intent ? `## Intent (gemergt auf showcase)\n\n${input.intent.trim()}` : null
}

/** Said to the agent once it used up its questions (`QUESTION_LIMIT`). */
const DELIVER_SPEC = 'Liefere jetzt die Spec ("type": "spec") — keine Rückfrage und keine Auswahl mehr; '
  + 'Unklares gehört unter Offene Punkte (openPoints).'

/** How many questions or choices are left; at 0 the agent must deliver the spec. */
function questionBudgetSection(input: PromptInput): string | null {
  if (input.questionsRemaining === undefined) {
    return null
  }
  const budget = `Du hast noch ${input.questionsRemaining} von ${QUESTION_LIMIT} Rückfragen/Auswahlen.`
  return input.questionsRemaining > 0 ? `## Rückfragen\n\n${budget}` : `## Rückfragen\n\n${budget} ${DELIVER_SPEC}`
}

function answeredQuestionsSection(input: PromptInput): string | null {
  if (!input.answeredQuestions.length) {
    return null
  }
  const pairs = input.answeredQuestions.map(({ question, answer }) => `**F:** ${question}\n**A:** ${answer}`).join('\n\n')
  return `## Bisherige Rückfragen (bereits beantwortet)\n\n${pairs}`
}

function correctionSection(retry: RetryContext): string {
  return [
    '## Korrektur erforderlich',
    retry.reason === 'invalid_json'
      ? 'Dein letzter Output enthielt kein gültiges JSON. Du hast vermutlich Text statt JSON ausgegeben:'
      : 'Dein letzter Output war strukturell ungültig:',
    '',
    '```',
    retry.previousOutput.slice(0, MAX_RETRY_OUTPUT_CHARS),
    '```',
    '',
    `**Fehler:** ${retry.schemaError}`,
    '',
    'Gib jetzt AUSSCHLIESSLICH das JSON-Objekt aus — kein Text davor oder danach, kein Markdown.',
  ].join('\n')
}
