import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'

const BASE = {
  skill: '# Intent Agent Skill',
  ticketKey: 'CB-2',
  title: 'Lesezeit bei Artikeln anzeigen',
  description: 'Leser möchten vorher sehen, wie lange ein Artikel dauert.',
  answeredQuestions: [],
}

describe('buildPrompt', () => {
  it('contains skill, key, title and description', () => {
    const prompt = buildPrompt(BASE)
    expect(prompt).toContain('# Intent Agent Skill')
    expect(prompt).toContain('Ticket: CB-2')
    expect(prompt).toContain('# Lesezeit bei Artikeln anzeigen')
    expect(prompt).toContain('## Beschreibung\nLeser möchten')
  })

  it('adds the codebase summary on the first call', () => {
    expect(buildPrompt({ ...BASE, codebaseSummary: 'Express + Prisma' })).toContain('## Codebase-Übersicht\n\nExpress + Prisma')
  })

  it('adds answered questions', () => {
    const prompt = buildPrompt({ ...BASE, answeredQuestions: [{ question: 'Wer?', answer: 'Alle Leser' }] })
    expect(prompt).toContain('## Bisherige Rückfragen (bereits beantwortet)')
    expect(prompt).toContain('**F:** Wer?\n**A:** Alle Leser')
  })

  it('builds a correction prompt without the summary on retry', () => {
    const prompt = buildPrompt({
      ...BASE,
      codebaseSummary: 'Express + Prisma',
      retryContext: { previousOutput: 'x'.repeat(4000), reason: 'invalid_json', schemaError: 'Agent-Ausgabe ist kein gültiges JSON' },
    })
    expect(prompt).not.toContain('Codebase-Übersicht')
    expect(prompt).toContain('## Korrektur erforderlich')
    expect(prompt).toContain('kein gültiges JSON')
    expect(prompt).not.toContain('x'.repeat(3001))
  })

  it('quotes the merged intent after the ticket', () => {
    const prompt = buildPrompt({ ...BASE, intent: '# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien\n' })
    expect(prompt).toContain('## Intent (gemergt auf showcase)\n\n# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien')
    expect(prompt.indexOf('## Beschreibung')).toBeLessThan(prompt.indexOf('## Intent'))
    expect(buildPrompt(BASE)).not.toContain('## Intent')
  })

  it('names the remaining questions and demands the spec when none are left', () => {
    expect(buildPrompt({ ...BASE, questionsRemaining: 2 })).toContain('## Rückfragen\n\nDu hast noch 2 von 3 Rückfragen/Auswahlen.')
    expect(buildPrompt({ ...BASE, questionsRemaining: 2 })).not.toContain('Liefere jetzt die Spec')
    expect(buildPrompt({ ...BASE, questionsRemaining: 0 })).toContain(
      'Du hast noch 0 von 3 Rückfragen/Auswahlen. Liefere jetzt die Spec ("type": "spec") — keine Rückfrage und keine Auswahl mehr; '
      + 'Unklares gehört unter Offene Punkte (openPoints).',
    )
    expect(buildPrompt(BASE)).not.toContain('## Rückfragen')
  })

  it('keeps intent and remaining questions in the correction prompt', () => {
    const prompt = buildPrompt({
      ...BASE, intent: 'Intent-Text', questionsRemaining: 0,
      retryContext: { previousOutput: '{}', reason: 'schema_mismatch', schemaError: 'result fehlt' },
    })
    expect(prompt).toContain('## Intent (gemergt auf showcase)\n\nIntent-Text')
    expect(prompt).toContain('Du hast noch 0 von 3')
    expect(prompt.indexOf('## Rückfragen')).toBeLessThan(prompt.indexOf('## Korrektur erforderlich'))
  })
})
