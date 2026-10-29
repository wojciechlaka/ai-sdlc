import type { Intent } from '@refinement/shared'

// Cases of the spec eval (`npm run eval:spec`): merged intents against the fixture repo `fixtures/articles-api`.
// New case: add an entry (key, ticket title and text, intent with 2–4 success criteria).

/** One eval case: a ticket of the fixture repo and the intent the spec agent starts from. */
export interface SpecEvalCase {
  /** Ticket key, also the folder `docs/work/<key>/` of the intent in the temp repo. */
  key: string
  title: string
  description: string
  intent: Intent
}

/** Fixture repo the cases run against (folder under `evals/fixtures/`). */
export const FIXTURE_NAME = 'articles-api'

export const SPEC_CASES: SpecEvalCase[] = [
  {
    key: 'EVAL-1',
    title: 'Lesezeit bei Artikeln anzeigen',
    description: 'Leser möchten vor dem Öffnen eines Artikels sehen, wie lange das Lesen ungefähr dauert.',
    intent: {
      title: 'Lesezeit anzeigen',
      problem: 'Leser wissen vor dem Öffnen nicht, wie lange ein Artikel dauert, und brechen lange Artikel ab.',
      desiredOutcome: 'Zu jedem Artikel ist eine geschätzte Lesezeit in Minuten sichtbar.',
      successCriteria: [
        'Leser sehen in der Artikelliste zu jedem Artikel, wie lange das Lesen ungefähr dauert.',
        'Leser sehen die Lesezeit auch in der Einzelansicht eines Artikels.',
        'Die angezeigte Lesezeit passt spürbar zur Länge des Artikels.',
      ],
      affected: ['Leser', 'Artikel-API'],
      openPoints: [],
    },
  },
  {
    key: 'EVAL-2',
    title: 'Entwürfe für Artikel',
    description: 'Autoren wollen Artikel als Entwurf speichern und erst später veröffentlichen.',
    intent: {
      title: 'Artikel als Entwurf speichern',
      problem: 'Autoren müssen Artikel sofort veröffentlichen; halbfertige Texte landen bei allen Lesern.',
      desiredOutcome: 'Autoren speichern Artikel als Entwurf und veröffentlichen sie, wenn sie fertig sind.',
      successCriteria: [
        'Autoren können einen Artikel speichern, ohne dass Leser ihn sehen.',
        'Autoren können einen Entwurf veröffentlichen; danach sehen ihn alle Leser.',
        'Leser finden in der Artikelliste keine Entwürfe.',
      ],
      affected: ['Autoren', 'Leser', 'Artikel-API'],
      openPoints: [{ question: 'Sollen Autoren eine Liste ihrer eigenen Entwürfe sehen?' }],
    },
  },
]
