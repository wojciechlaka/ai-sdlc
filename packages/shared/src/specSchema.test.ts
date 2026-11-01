import { describe, it, expect } from 'vitest'
import { SpecAgentOutputSchema, SpecSchema } from './specSchema'

const SPEC = {
  title: 'Lesezeit in der Artikel-API',
  goal: 'Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.',
  approach: {
    chosen: 'Lesezeit beim Lesen im Service berechnen.',
    rationale: 'Keine Migration nötig.',
    alternatives: [{ name: 'Feld in der Datenbank', reason: 'braucht eine Migration' }],
  },
  components: [{ name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body: string): number', dependsOn: [] }],
  dataFlow: 'Service lädt Artikel → readingTime → Antwort.',
  errorHandling: 'Leerer Text ergibt 1 Minute.',
  acceptanceCriteria: ['GET /api/articles/:slug enthält readingTimeMinutes'],
  tests: 'Unit-Test für readingTime, Route-Test für das Feld.',
  affectedFiles: [{ path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false }],
  risks: [{ description: 'Lange Texte', severity: 'low', mitigation: 'Berechnung ist linear' }],
  openPoints: [],
}

describe('SpecSchema', () => {
  it('accepts a complete spec', () => {
    expect(SpecSchema.parse(SPEC)).toEqual(SPEC)
  })

  it('rejects long titles, missing acceptance criteria and unknown severities', () => {
    expect(SpecSchema.safeParse({ ...SPEC, title: 'x'.repeat(61) }).success).toBe(false)
    expect(SpecSchema.safeParse({ ...SPEC, acceptanceCriteria: [] }).success).toBe(false)
    expect(SpecSchema.safeParse({ ...SPEC, risks: [{ ...SPEC.risks[0], severity: 'critical' }] }).success).toBe(false)
  })

  it('requires isNew on every affected file', () => {
    expect(SpecSchema.safeParse({ ...SPEC, affectedFiles: [{ path: 'a.js', change: 'neu' }] }).success).toBe(false)
  })
})

describe('SpecAgentOutputSchema', () => {
  it('accepts a question, a choice and a spec', () => {
    expect(SpecAgentOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
    const choice = {
      type: 'choice', question: 'Wo?', recommended: 'A',
      options: [
        { id: 'A', title: 'a', description: 'd', pros: [], cons: [] },
        { id: 'B', title: 'b', description: 'd', pros: [], cons: [] },
      ],
    }
    expect(SpecAgentOutputSchema.parse(choice).type).toBe('choice')
    expect(SpecAgentOutputSchema.parse({ type: 'spec', result: SPEC }).type).toBe('spec')
  })

  it('rejects an invalid choice, the intent and the old refinement output', () => {
    expect(SpecAgentOutputSchema.safeParse({ type: 'choice', question: 'Wo?', options: [], recommended: 'A' }).success).toBe(false)
    expect(SpecAgentOutputSchema.safeParse({ type: 'intent', result: {} }).success).toBe(false)
    expect(SpecAgentOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
