import { describe, it, expect } from 'vitest'
import type { Intent, Spec } from '@refinement/shared'
import { JudgeVerdictSchema, RUBRIC, buildJudgePrompt, failedScores, fixedChecks } from './specRubric'

const INTENT: Intent = {
  title: 'Lesezeit', problem: 'P', desiredOutcome: 'O',
  successCriteria: ['Liste zeigt Lesezeit', 'Einzelansicht zeigt Lesezeit'], affected: [], openPoints: [],
}

const SPEC: Spec = {
  title: 'Lesezeit', goal: 'Ziel',
  approach: { chosen: 'Im Service', rationale: 'R', alternatives: [{ name: 'Datenbankfeld', reason: 'Migration' }] },
  components: [], dataFlow: 'D', errorHandling: 'E',
  acceptanceCriteria: ['GET /api/articles liefert readingTimeMinutes', 'GET /api/articles/:slug liefert readingTimeMinutes'],
  tests: 'Unit', risks: [], openPoints: [],
  affectedFiles: [
    { path: 'src/services/articleService.js', change: 'Feld', isNew: false },
    { path: 'src/services/readingTime.js', change: 'neu', isNew: true },
  ],
}

const FILES = new Set(['src/services/articleService.js', 'src/app.js'])
const passed = (spec: Spec) => Object.fromEntries(fixedChecks(spec, INTENT, FILES).map((check) => [check.name, check.pass]))

describe('fixedChecks', () => {
  it('passes a spec that fits the fixture and the intent', () => {
    expect(fixedChecks(SPEC, INTENT, FILES).every((check) => check.pass)).toBe(true)
  })

  it('fails for a missing file that is not marked new, and accepts a leading ./', () => {
    const spec = { ...SPEC, affectedFiles: [{ path: './src/app.js', change: 'x', isNew: false }, { path: 'src/nope.js', change: 'x', isNew: false }] }
    const check = fixedChecks(spec, INTENT, FILES).find((c) => c.name === 'Betroffene Dateien existieren')
    expect(check).toEqual({ name: 'Betroffene Dateien existieren', pass: false, detail: 'fehlen: src/nope.js' })
  })

  it('fails for fewer acceptance than success criteria, code blocks and missing alternatives', () => {
    expect(passed({ ...SPEC, acceptanceCriteria: ['eins'] })['Akzeptanz- ≥ Erfolgskriterien']).toBe(false)
    expect(passed({ ...SPEC, dataFlow: 'So:\n```js\nfoo()\n```' })['Kein Code-Block']).toBe(false)
    expect(passed({ ...SPEC, approach: { ...SPEC.approach, alternatives: [{ name: 'X', reason: ' ' }] } })['Verworfene Alternative mit Grund']).toBe(false)
  })
})

describe('JudgeVerdictSchema', () => {
  const scores = RUBRIC.map((criterion) => ({ criterion: criterion.id, score: 4, reason: 'gut' }))

  it('accepts one score per criterion', () => {
    expect(JudgeVerdictSchema.safeParse({ scores, coverage: [] }).success).toBe(true)
  })

  it('rejects missing or duplicate criteria and scores outside 1–5', () => {
    expect(JudgeVerdictSchema.safeParse({ scores: scores.slice(1), coverage: [] }).success).toBe(false)
    expect(JudgeVerdictSchema.safeParse({ scores: [...scores, scores[0]], coverage: [] }).success).toBe(false)
    expect(JudgeVerdictSchema.safeParse({ scores: [{ ...scores[0], score: 6 }, ...scores.slice(1)], coverage: [] }).success).toBe(false)
  })

  it('reports the criteria below the threshold by name', () => {
    const verdict = JudgeVerdictSchema.parse({ scores: [{ ...scores[0], score: 2, reason: 'lückenhaft' }, ...scores.slice(1)], coverage: [] })
    expect(failedScores(verdict, 3)).toEqual([{ name: 'Abdeckung', score: 2, reason: 'lückenhaft' }])
    expect(failedScores(verdict, 2)).toEqual([])
  })
})

describe('buildJudgePrompt', () => {
  it('contains every criterion, intent, spec and codebase and asks for JSON only', () => {
    const prompt = buildJudgePrompt({ intentMarkdown: '# Intent-Text', specMarkdown: '# Spec-Text', fixtureOverview: 'src/app.js' })
    for (const criterion of RUBRIC) {
      expect(prompt).toContain(`- ${criterion.id} (${criterion.name}):`)
    }
    expect(prompt).toContain('## Intent\n\n# Intent-Text')
    expect(prompt).toContain('## Spec\n\n# Spec-Text')
    expect(prompt).toContain('## Codebase\n\nsrc/app.js')
    expect(prompt).toContain('Antworte ausschließlich mit einem JSON-Objekt')
  })
})
