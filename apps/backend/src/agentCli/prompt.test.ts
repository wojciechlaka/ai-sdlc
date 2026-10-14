import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'

const BASE_INPUT = {
  skill: '# Refinement Agent\nYou are a refinement agent.',
  ticketId: 'ticket-123',
  title: 'Add reconnect logic',
  description: 'Players drop on disconnect.',
  acceptanceCriteria: 'Player can rejoin within 30s',
  summary: undefined as string | undefined,
}

describe('buildPrompt', () => {
  it('includes skill, ticket ID and title', () => {
    const prompt = buildPrompt(BASE_INPUT)
    expect(prompt).toContain('Refinement Agent')
    expect(prompt).toContain('ticket-123')
    expect(prompt).toContain('Add reconnect logic')
  })

  it('includes acceptanceCriteria when present', () => {
    const prompt = buildPrompt(BASE_INPUT)
    expect(prompt).toContain('Player can rejoin within 30s')
  })

  it('omits acceptanceCriteria section when empty', () => {
    const prompt = buildPrompt({ ...BASE_INPUT, acceptanceCriteria: '' })
    expect(prompt).not.toContain('Akzeptanzkriterien')
  })

  it('includes previous output as feedback when summary provided', () => {
    const prompt = buildPrompt({ ...BASE_INPUT, summary: 'Previous attempt failed.' })
    expect(prompt).toContain('Previous attempt failed.')
    expect(prompt).toContain('Vorheriger Versuch')
  })

  it('includes previousRuns section when previousRuns are provided', () => {
    const prompt = buildPrompt({
      ...BASE_INPUT,
      previousRuns: [{ question: 'Which DB?', answer: 'PostgreSQL' }],
    })
    expect(prompt).toContain('Bisherige Rückfragen')
    expect(prompt).toContain('Which DB?')
    expect(prompt).toContain('PostgreSQL')
  })
})
