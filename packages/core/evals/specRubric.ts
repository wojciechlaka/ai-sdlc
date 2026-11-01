import { z } from 'zod'
import type { Intent, Spec } from '@refinement/shared'

// Rubric of the spec eval (`npm run eval:spec`): fixed checks without a model and the criteria the judge model
// scores. Pure functions, unit-tested in specRubric.test.ts; texts are German (they reach the report and the judge).

/** A judge score below this fails the eval (scores are 1–5). Override with `EVAL_MIN_SCORE`. */
export const DEFAULT_MIN_SCORE = 3

/** Criteria the judge scores, each 1–5 with a reason. */
export const RUBRIC = [
  { id: 'coverage', name: 'Abdeckung', question: 'Ist jedes Erfolgskriterium des Intents durch mindestens ein prüfbares Akzeptanzkriterium abgedeckt?' },
  { id: 'testability', name: 'Prüfbarkeit', question: 'Sind die Akzeptanzkriterien beobachtbar und eindeutig prüfbar?' },
  { id: 'codebaseFit', name: 'Passung zur Codebase', question: 'Nutzen Ansatz und Komponenten die vorhandenen Muster und Dateien der Codebase?' },
  { id: 'yagni', name: 'YAGNI', question: 'Enthält die Spec nur, was der Intent verlangt (keine zusätzlichen Funktionen)?' },
  { id: 'consistency', name: 'Konsistenz', question: 'Decken die Tests die Akzeptanzkriterien ab, und hat jedes Risiko eine Gegenmaßnahme?' },
] as const

/** Id of a rubric criterion. */
export type RubricId = (typeof RUBRIC)[number]['id']

const RUBRIC_IDS = RUBRIC.map((criterion) => criterion.id) as [RubricId, ...RubricId[]]

/** Answer of the judge: one score per criterion and the mapping success criterion → acceptance criteria. */
export const JudgeVerdictSchema = z.object({
  scores: z.array(z.object({
    criterion: z.enum(RUBRIC_IDS),
    score: z.number().int().min(1).max(5),
    reason: z.string(),
  })).refine(
    (scores) => RUBRIC_IDS.every((id) => scores.filter((score) => score.criterion === id).length === 1),
    'Jedes Kriterium braucht genau eine Bewertung',
  ),
  coverage: z.array(z.object({ successCriterion: z.string(), acceptanceCriteria: z.array(z.string()) })),
})
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>

/** Result of one fixed check: German name, pass/fail and what was found. */
export interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

/** Every string inside a value (recursively), to search all text fields of the spec at once. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(allStrings)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(allStrings)
  }
  return []
}

/**
 * Checks that need no model: affected files exist unless marked new, at least as many acceptance criteria as
 * success criteria, no code blocks, at least one dropped alternative with a reason.
 * @param fixtureFiles - Paths of the fixture repo, relative and `/`-separated.
 */
export function fixedChecks(spec: Spec, intent: Intent, fixtureFiles: ReadonlySet<string>): CheckResult[] {
  const missing = spec.affectedFiles
    .filter((file) => !file.isNew && !fixtureFiles.has(file.path.replace(/^\.\//, '')))
    .map((file) => file.path)
  const withCode = allStrings(spec).filter((text) => text.includes('```'))
  const alternatives = spec.approach.alternatives.filter((alt) => alt.name.trim() && alt.reason.trim())
  return [
    {
      name: 'Betroffene Dateien existieren',
      pass: missing.length === 0,
      detail: missing.length ? `fehlen: ${missing.join(', ')}` : `${spec.affectedFiles.length} Dateien`,
    },
    {
      name: 'Akzeptanz- ≥ Erfolgskriterien',
      pass: spec.acceptanceCriteria.length >= intent.successCriteria.length,
      detail: `${spec.acceptanceCriteria.length} ≥ ${intent.successCriteria.length}`,
    },
    {
      name: 'Kein Code-Block',
      pass: withCode.length === 0,
      detail: withCode.length ? `${withCode.length} Felder mit Code-Block` : 'keiner',
    },
    {
      name: 'Verworfene Alternative mit Grund',
      pass: alternatives.length > 0,
      detail: `${alternatives.length}`,
    },
  ]
}

/** German prompt of the judge: rubric, intent, spec and fixture overview; the answer is one JSON object. */
export function buildJudgePrompt(input: { intentMarkdown: string; specMarkdown: string; fixtureOverview: string }): string {
  return [
    'Du bewertest eine technische Spec (Stufe Design) gegen ihren Intent und die Codebase. Nutze keine Werkzeuge;',
    'alles Nötige steht in diesem Text.',
    '',
    '## Kriterien (je 1 = schlecht bis 5 = sehr gut)',
    ...RUBRIC.map((criterion) => `- ${criterion.id} (${criterion.name}): ${criterion.question}`),
    '',
    '## Intent',
    '',
    input.intentMarkdown.trim(),
    '',
    '## Spec',
    '',
    input.specMarkdown.trim(),
    '',
    '## Codebase',
    '',
    input.fixtureOverview.trim(),
    '',
    '## Antwort',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt, ohne Text davor oder danach:',
    '{ "scores": [{ "criterion": "<id>", "score": <1–5>, "reason": "<ein Satz>" }],',
    '  "coverage": [{ "successCriterion": "<Erfolgskriterium>", "acceptanceCriteria": ["<Akzeptanzkriterium, das es abdeckt>"] }] }',
    `Je Kriterium genau ein Eintrag in scores (${RUBRIC_IDS.join(', ')}); je Erfolgskriterium ein Eintrag in coverage.`,
  ].join('\n')
}

/** Criteria scored below `minScore`, with their German names; empty when all pass. */
export function failedScores(verdict: JudgeVerdict, minScore: number): { name: string; score: number; reason: string }[] {
  return verdict.scores
    .filter((score) => score.score < minScore)
    .map((score) => ({ name: RUBRIC.find((criterion) => criterion.id === score.criterion)!.name, score: score.score, reason: score.reason }))
}
