import type { ChoiceOutput, Intent, IntentAgentOutput, Spec, SpecAgentOutput } from '@refinement/shared'
import type { ExternalTicket } from '../domain/types'

// Shared test data: target repository, agent output and usage, source tickets.

/** Target repository of every test context; PR URLs of the in-memory code host start with it. */
export const TEST_REPO_URL = 'https://github.com/o/r'

/** Intent the scripted agent writes by default. */
export const SAMPLE_INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit.',
  successCriteria: ['Leser sehen vor dem Lesen, wie lange ein Artikel ungefähr dauert.'],
  affected: ['Leser'],
  openPoints: [],
}

/** Default agent output: `SAMPLE_INTENT` as a stage 1 result. */
export const SAMPLE_INTENT_OUTPUT: IntentAgentOutput = { type: 'intent', result: SAMPLE_INTENT }

/** Spec of a stage 2 result in tests. */
export const SAMPLE_SPEC: Spec = {
  title: 'Lesezeit in der Artikel-API',
  goal: 'Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.',
  approach: { chosen: 'Beim Lesen im Service berechnen.', rationale: 'Keine Migration.', alternatives: [{ name: 'Datenbankfeld', reason: 'Migration nötig' }] },
  components: [{ name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body)', dependsOn: [] }],
  dataFlow: 'Route → Service → readingTime.',
  errorHandling: 'Leerer Text ergibt 1 Minute.',
  acceptanceCriteria: ['Jeder Artikel in der API-Antwort hat readingTimeMinutes.'],
  tests: 'Unit-Test für readingTime.',
  affectedFiles: [{ path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false }],
  risks: [],
  openPoints: [],
}

/** `SAMPLE_SPEC` as a stage 2 result. */
export const SAMPLE_SPEC_OUTPUT: SpecAgentOutput = { type: 'spec', result: SAMPLE_SPEC }

/** A stage 2 choice between two approaches; B is recommended. */
export const SAMPLE_CHOICE_OUTPUT: ChoiceOutput = {
  type: 'choice',
  question: 'Wo wird die Lesezeit berechnet?',
  options: [
    { id: 'A', title: 'Beim Speichern', description: 'Feld am Artikel.', pros: ['schnell beim Lesen'], cons: ['Migration'] },
    { id: 'B', title: 'Beim Lesen', description: 'Im Service.', pros: ['keine Migration'], cons: ['Rechenzeit pro Abruf'] },
  ],
  recommended: 'B',
}

/** Default usage of a scripted agent run. */
export const SAMPLE_META = {
  model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001,
}

/** A source ticket as the Markdown source would deliver it. */
export function externalTicket(key: string, patch: Partial<ExternalTicket> = {}): ExternalTicket {
  return {
    key,
    title: `Ticket ${key}`,
    description: `Beschreibung ${key}`,
    priority: 'Mittel',
    sourcePath: `examples/tickets/${key.toLowerCase()}.md`,
    ...patch,
  }
}
