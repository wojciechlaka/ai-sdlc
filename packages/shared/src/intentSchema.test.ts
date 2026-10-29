import { describe, it, expect } from 'vitest'
import { IntentAgentOutputSchema, IntentSchema } from './intentSchema'

const INTENT = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine Lesezeit in Minuten.',
  successCriteria: ['Leser sehen vor dem Lesen, wie lange ein Artikel ungefähr dauert.'],
  affected: ['Leser', 'Artikel-API'],
  openPoints: [{ question: 'Wörter pro Minute?' }],
}

describe('IntentSchema', () => {
  it('accepts a complete intent', () => {
    expect(IntentSchema.parse(INTENT)).toEqual(INTENT)
  })

  it('rejects titles longer than 60 characters', () => {
    expect(IntentSchema.safeParse({ ...INTENT, title: 'x'.repeat(61) }).success).toBe(false)
  })

  it('rejects an empty list of success criteria', () => {
    expect(IntentSchema.safeParse({ ...INTENT, successCriteria: [] }).success).toBe(false)
  })

  it('rejects an intent without success criteria', () => {
    const { successCriteria: _omitted, ...withoutCriteria } = INTENT
    expect(IntentSchema.safeParse(withoutCriteria).success).toBe(false)
  })
})

describe('IntentAgentOutputSchema', () => {
  it('accepts a question', () => {
    expect(IntentAgentOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
  })

  it('accepts an intent result', () => {
    expect(IntentAgentOutputSchema.parse({ type: 'intent', result: INTENT }).type).toBe('intent')
  })

  it('rejects the old refinement output', () => {
    expect(IntentAgentOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
