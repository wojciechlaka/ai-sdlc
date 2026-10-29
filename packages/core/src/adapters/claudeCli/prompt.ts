import type { QAPair } from '../../domain/types'
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
  answeredQuestions: QAPair[]
  retryContext?: RetryContext
}

/**
 * Builds the full prompt for the Claude CLI: skill, ticket and answered questions.
 * With `retryContext` it becomes a correction prompt that quotes the malformed output.
 */
export function buildPrompt(input: PromptInput): string {
  const parts = input.retryContext
    ? [input.skill, '---', ...ticketSection(input), answeredQuestionsSection(input), correctionSection(input.retryContext)]
    : [input.skill, '---', summarySection(input), ...ticketSection(input), answeredQuestionsSection(input)]
  return parts.filter((part): part is string => Boolean(part)).join('\n\n')
}

function ticketSection(input: PromptInput): string[] {
  return [`Ticket: ${input.ticketKey}`, `# ${input.title}`, `## Beschreibung\n${input.description}`]
}

/** Omitted on retry: the agent already analysed the codebase. */
function summarySection(input: PromptInput): string | null {
  return input.codebaseSummary ? `## Codebase-Übersicht\n\n${input.codebaseSummary}\n\n---` : null
}

function answeredQuestionsSection(input: PromptInput): string | null {
  if (!input.answeredQuestions.length) return null
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
