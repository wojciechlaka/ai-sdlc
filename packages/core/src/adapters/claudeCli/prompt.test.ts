import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'

const BASE = {
  skill: '# Intent Agent Skill',
  ticketKey: 'CB-2',
  title: 'Lesezeit bei Artikeln anzeigen',
  description: 'Leser möchten vorher sehen, wie lange ein Artikel dauert.',
  previousRuns: [],
}

describe('buildPrompt', () => {
  it('contains skill, key, title and description', () => {
    const prompt = buildPrompt(BASE)
    expect(prompt).toContain('# Intent Agent Skill')
    expect(prompt).toContain('Ticket: CB-2')
    expect(prompt).toContain('# Lesezeit bei Artikeln anzeigen')
    expect(prompt).toContain('## Beschreibung\nLeser möchten')
  })

  it('adds the codebase summary on the first attempt', () => {
    expect(buildPrompt({ ...BASE, codebaseSummary: 'Express + Prisma' })).toContain('## Codebase-Übersicht\n\nExpress + Prisma')
  })

  it('adds answered questions', () => {
    const prompt = buildPrompt({ ...BASE, previousRuns: [{ question: 'Wer?', answer: 'Alle Leser' }] })
    expect(prompt).toContain('## Bisherige Rückfragen (bereits beantwortet)')
    expect(prompt).toContain('**F:** Wer?\n**A:** Alle Leser')
  })

  it('builds a correction prompt without the summary on retry', () => {
    const prompt = buildPrompt({
      ...BASE,
      codebaseSummary: 'Express + Prisma',
      retryContext: { previousOutput: 'x'.repeat(4000), schemaError: 'Agent-Ausgabe verletzt das Schema: Agent output is not valid JSON' },
    })
    expect(prompt).not.toContain('Codebase-Übersicht')
    expect(prompt).toContain('## Korrektur erforderlich')
    expect(prompt).toContain('kein gültiges JSON')
    expect(prompt).not.toContain('x'.repeat(3001))
  })
})
