import { describe, it, expect } from 'vitest'
import { IntentAgentOutputSchema, IntentSchema } from './intentSchema'

const INTENT = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine Lesezeit in Minuten.',
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
