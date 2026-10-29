import type { QAPair } from '../../domain/types'

export type { QAPair }

const MAX_RETRY_OUTPUT_CHARS = 3000

export interface PromptInput {
  skill: string
  ticketId: string
  title: string
  description: string
  acceptanceCriteria: string
  codebaseSummary?: string
  summary?: string
  previousRuns?: QAPair[]
  retryContext?: {
    previousOutput: string
    schemaError: string
  }
}

/**
 * Builds the full prompt string for the Claude CLI.
 * If `retryContext` is set, produces a correction prompt that includes the previous malformed output;
 * otherwise builds the standard initial prompt with optional codebase summary and Q&A history.
 * @param input - All data needed to construct the prompt.
 */
export function buildPrompt(input: PromptInput): string {
  if (input.retryContext) {
    return buildRetryPrompt(input)
  }
  return buildInitialPrompt(input)
}

/**
 * Builds the standard prompt for a new or answer-triggered run.
 * Includes the skill, optional codebase summary, ticket content, and Q&A history.
 * The codebase summary is omitted on retry runs to avoid wasting tokens on re-analysis.
 * @param input - All data needed to construct the prompt.
 */
function buildInitialPrompt(input: PromptInput): string {
  const ac = input.acceptanceCriteria
    ? `\n\n## Akzeptanzkriterien\n${input.acceptanceCriteria}`
    : ''

  const summarySection = input.codebaseSummary
    ? `## Codebase-Übersicht\n\n${input.codebaseSummary}\n\n---`
    : null

  const feedbackSection = input.summary
    ? `## Vorheriger Versuch (fehlgeschlagen)\n\n${input.summary}\n\nBitte korrigiere die Ausgabe.`
    : null

  const previousRunsSection = input.previousRuns?.length
    ? [
        '## Bisherige Rückfragen (bereits beantwortet)',
        input.previousRuns.map(({ question, answer }) =>
          `**F:** ${question}\n**A:** ${answer}`
        ).join('\n\n'),
      ].join('\n\n')
    : null

  const parts = [
    input.skill,
    '---',
    summarySection,
    `Ticket ID: ${input.ticketId}`,
    'Ticket:',
    `# ${input.title}`,
    `## Beschreibung\n${input.description}${ac}`,
    previousRunsSection,
    feedbackSection,
  ].filter(Boolean)

  return parts.join('\n\n')
}

/**
 * Builds a correction prompt for the retry attempt after a schema validation failure.
 * Omits the codebase summary (already analyzed) and injects the previous malformed output
 * alongside the validation error so the agent can fix its response.
 * Truncates the previous output to `MAX_RETRY_OUTPUT_CHARS` to avoid excessive prompt size.
 * @param input - All data needed to construct the prompt; `retryContext` must be set.
 */
function buildRetryPrompt(input: PromptInput): string {
  const { retryContext } = input
  if (!retryContext) return ''

  const ac = input.acceptanceCriteria
    ? `\n\n## Akzeptanzkriterien\n${input.acceptanceCriteria}`
    : ''

  const previousRunsSection = input.previousRuns?.length
    ? [
        '## Bisherige Rückfragen (bereits beantwortet)',
        input.previousRuns.map(({ question, answer }) =>
          `**F:** ${question}\n**A:** ${answer}`
        ).join('\n\n'),
      ].join('\n\n')
    : null

  const parts = [
    input.skill,
    '---',
    `Ticket ID: ${input.ticketId}`,
    'Ticket:',
    `# ${input.title}`,
    `## Beschreibung\n${input.description}${ac}`,
    previousRunsSection,
    [
      '## Korrektur erforderlich',
      retryContext.schemaError === 'Agent output is not valid JSON'
        ? 'Dein letzter Output enthielt kein gültiges JSON. Du hast vermutlich Text statt JSON ausgegeben:'
        : 'Du hast die Codebase bereits analysiert. Dein letzter Output war strukturell ungültig:',
      '',
      '```',
      retryContext.previousOutput.slice(0, MAX_RETRY_OUTPUT_CHARS),
      '```',
      '',
      `**Fehler:** ${retryContext.schemaError}`,
      '',
      'Gib jetzt AUSSCHLIESSLICH das JSON-Objekt aus — kein Text davor oder danach, kein Markdown.',
    ].join('\n'),
  ].filter(Boolean)

  return parts.join('\n\n')
}
