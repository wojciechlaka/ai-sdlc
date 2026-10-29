import type { Intent, IntentAgentOutput } from '@refinement/shared'
import type { SourceTicket } from '../domain/types'

// Shared test data: target repository, agent output and usage, source tickets.

/** Target repository of every test context; PR URLs of the fake code host start with it. */
export const TEST_REPO_URL = 'https://github.com/o/r'

/** Intent the fake agent writes by default. */
export const SAMPLE_INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit.',
  affected: ['Leser'],
  openPoints: [],
}

/** Default agent output: `SAMPLE_INTENT` as a stage 1 result. */
export const SAMPLE_INTENT_OUTPUT: IntentAgentOutput = { type: 'intent', result: SAMPLE_INTENT }

/** Default usage of a fake agent run. */
export const SAMPLE_META = {
  model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001,
}

/** A source ticket as the Markdown source would deliver it. */
export function sourceTicket(key: string, patch: Partial<SourceTicket> = {}): SourceTicket {
  return {
    key,
    title: `Ticket ${key}`,
    description: `Beschreibung ${key}`,
    priority: 'Mittel',
    sourcePath: `examples/tickets/${key.toLowerCase()}.md`,
    ...patch,
  }
}
