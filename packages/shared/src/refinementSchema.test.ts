import { describe, it, expect } from 'vitest'
import { RefinementOutputSchema, AgentOutputSchema } from './refinementSchema'

const VALID_OUTPUT = {
  title: 'Add reconnect logic',
  userStory: 'Als Spieler möchte ich nach einem Verbindungsabbruch erneut beitreten, damit mein Spielfortschritt erhalten bleibt.',
  acceptanceCriteria: ['Player can reconnect within 30s', 'Game state is preserved'],
  affectedFiles: [
    { path: 'src/game.ts', description: 'Add reconnect handler' },
  ],

  risks: [{ description: 'Race condition on simultaneous rejoin', severity: 'medium' as const }],
  openQuestions: [
    { question: 'What is the reconnect timeout?', blocksImplementation: false },
  ],
  confidence: 82,
}

describe('RefinementOutputSchema', () => {
  it('accepts a valid output', () => {
    const result = RefinementOutputSchema.safeParse(VALID_OUTPUT)
    expect(result.success).toBe(true)
  })

  it('rejects title longer than 60 characters', () => {
    const result = RefinementOutputSchema.safeParse({
      ...VALID_OUTPUT,
      title: 'A'.repeat(61),
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('title')
  })

  it('rejects confidence outside 0-100', () => {
    const result = RefinementOutputSchema.safeParse({ ...VALID_OUTPUT, confidence: 101 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('confidence')
  })

  it('rejects confidence below 0', () => {
    const result = RefinementOutputSchema.safeParse({ ...VALID_OUTPUT, confidence: -1 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('confidence')
  })

  it('rejects missing blocksImplementation in openQuestions', () => {
    const result = RefinementOutputSchema.safeParse({
      ...VALID_OUTPUT,
      openQuestions: [{ question: 'Something?' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts empty openQuestions array', () => {
    const result = RefinementOutputSchema.safeParse({ ...VALID_OUTPUT, openQuestions: [] })
    expect(result.success).toBe(true)
  })
})

describe('AgentOutputSchema', () => {
  it('accepts a question output', () => {
    const result = AgentOutputSchema.safeParse({ type: 'question', question: 'Which DB?' })
    expect(result.success).toBe(true)
  })

  it('accepts a refinement output', () => {
    const result = AgentOutputSchema.safeParse({ type: 'refinement', result: VALID_OUTPUT })
    expect(result.success).toBe(true)
  })

  it('rejects unknown type', () => {
    const result = AgentOutputSchema.safeParse({ type: 'other', question: 'x' })
    expect(result.success).toBe(false)
  })

  it('rejects question without question field', () => {
    const result = AgentOutputSchema.safeParse({ type: 'question' })
    expect(result.success).toBe(false)
  })
})
