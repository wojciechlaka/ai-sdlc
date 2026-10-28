import { describe, it, expect } from 'vitest'
import type { Intent } from '@refinement/shared'
import { renderIntent, renderPullRequestBody } from './render'

const TICKET = { key: 'CB-2', title: 'Lesezeit bei Artikeln anzeigen', sourcePath: 'examples/tickets/cb-2-lesezeit.md' }

const INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.\n',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit in Minuten.',
  affected: ['Leser', 'Artikel-API'],
  openPoints: [{ question: 'Wie viele Wörter pro Minute?' }],
}

describe('renderIntent', () => {
  it('renders front matter and all sections', () => {
    expect(renderIntent(TICKET, INTENT, [{ question: 'Gilt das auch für Entwürfe?', answer: 'Nein.' }])).toBe(
      [
        '---',
        'ticket: CB-2',
        'stage: plan',
        'source: examples/tickets/cb-2-lesezeit.md',
        '---',
        '',
        '# CB-2: Lesezeit anzeigen',
        '',
        '## Problem',
        '',
        'Leser wissen nicht, wie lange ein Artikel dauert.',
        '',
        '## Gewünschtes Ergebnis',
        '',
        'Die Artikel-API liefert eine geschätzte Lesezeit in Minuten.',
        '',
        '## Betroffene',
        '',
        '- Leser',
        '- Artikel-API',
        '',
        '## Offene Punkte',
        '',
        '- Wie viele Wörter pro Minute?',
        '',
        '## Geklärte Rückfragen',
        '',
        '**F:** Gilt das auch für Entwürfe?\\',
        '**A:** Nein.',
        '',
      ].join('\n'),
    )
  })

  it('writes "Keine." for empty lists', () => {
    const md = renderIntent(TICKET, { ...INTENT, affected: [], openPoints: [] }, [])
    expect(md).toContain('## Betroffene\n\nKeine.\n')
    expect(md).toContain('## Offene Punkte\n\nKeine.\n')
    expect(md).toContain('## Geklärte Rückfragen\n\nKeine.\n')
  })
})

describe('renderIntent line breaks', () => {
  it('keeps single-line fields on one line', () => {
    const md = renderIntent(
      TICKET,
      { ...INTENT, title: 'Lese\nzeit', affected: ['Le\nser'], openPoints: [{ question: 'Wie\nviele?' }] },
      [{ question: 'Frage\nzwei?', answer: 'Ja,\nklar.' }],
    )
    expect(md).toContain('# CB-2: Lese zeit\n')
    expect(md).toContain('- Le ser\n')
    expect(md).toContain('- Wie viele?\n')
    expect(md).toContain('**F:** Frage zwei?\\\n**A:** Ja, klar.')
  })
})

describe('renderPullRequestBody', () => {
  it('names the artifact, summarises it and explains the gate', () => {
    expect(renderPullRequestBody(TICKET, 'plan', 'Leser wissen nicht, wie lange ein Artikel dauert.')).toBe(
      [
        '**CB-2: Intent** für „Lesezeit bei Artikeln anzeigen“',
        '',
        'Leser wissen nicht, wie lange ein Artikel dauert.',
        '',
        'Quelle: `examples/tickets/cb-2-lesezeit.md`',
        '',
        '---',
        'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
      ].join('\n'),
    )
  })
})
