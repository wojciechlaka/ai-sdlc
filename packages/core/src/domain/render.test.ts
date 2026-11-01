import { describe, it, expect } from 'vitest'
import type { Intent, Spec } from '@refinement/shared'
import { renderIntent, renderPullRequestBody, renderSpec, titleWithoutKey } from './render'

const TICKET = { key: 'CB-2', title: 'Lesezeit bei Artikeln anzeigen', sourcePath: 'examples/tickets/cb-2-lesezeit.md' }

const INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.\n',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit in Minuten.',
  successCriteria: [
    'Leser sehen vor dem Öffnen eines Artikels, wie lange das Lesen ungefähr dauert.',
    'Die angezeigte Lesezeit passt spürbar zur Länge des Artikels.',
  ],
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
        '## Erfolgskriterien',
        '',
        '- Leser sehen vor dem Öffnen eines Artikels, wie lange das Lesen ungefähr dauert.',
        '- Die angezeigte Lesezeit passt spürbar zur Länge des Artikels.',
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
      {
        ...INTENT,
        title: 'Lese\nzeit',
        successCriteria: ['Leser sehen\ndie Lesezeit.'],
        affected: ['Le\nser'],
        openPoints: [{ question: 'Wie\nviele?' }],
      },
      [{ question: 'Frage\nzwei?', answer: 'Ja,\nklar.' }],
    )
    expect(md).toContain('# CB-2: Lese zeit\n')
    expect(md).toContain('## Erfolgskriterien\n\n- Leser sehen die Lesezeit.\n')
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

const SPEC: Spec = {
  title: 'Lesezeit in der Artikel-API',
  goal: 'Die Artikel-API liefert eine geschätzte Lesezeit.\nSie gilt für Liste und Einzelansicht.\n',
  approach: {
    chosen: 'Lesezeit beim Lesen im Service berechnen.',
    rationale: 'Keine Migration nötig.',
    alternatives: [{ name: 'Feld in der Datenbank', reason: 'braucht eine\nMigration' }],
  },
  components: [
    { name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body: string): number', dependsOn: [] },
    { name: 'articleService', purpose: 'liefert Artikel', interface: 'getArticle(slug)', dependsOn: ['readingTime', 'articleStore'] },
  ],
  dataFlow: 'Route → Service → readingTime → Antwort.',
  errorHandling: 'Leerer Text ergibt 1 Minute.',
  acceptanceCriteria: ['GET /api/articles/:slug enthält readingTimeMinutes.', 'Die Liste enthält das Feld je Artikel.'],
  tests: 'Unit-Test für readingTime; Route-Test für das Feld.',
  affectedFiles: [
    { path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false },
    { path: 'src/utils/readingTime.js', change: 'Berechnung', isNew: true },
  ],
  risks: [{ description: 'Sehr lange Texte', severity: 'low', mitigation: 'Berechnung ist linear' }],
  openPoints: [{ question: 'Wörter pro Minute für Code-Blöcke?' }],
}

describe('renderSpec', () => {
  it('renders front matter and all sections', () => {
    expect(renderSpec(TICKET, SPEC, [{ question: 'Wo wird die Lesezeit berechnet?', answer: 'Ansatz B: Beim Lesen' }])).toBe(
      [
        '---',
        'ticket: CB-2',
        'stage: design',
        'source: examples/tickets/cb-2-lesezeit.md',
        'intent: docs/work/CB-2/intent.md',
        '---',
        '',
        '# CB-2: Lesezeit in der Artikel-API',
        '',
        '## Ziel',
        '',
        'Die Artikel-API liefert eine geschätzte Lesezeit.',
        'Sie gilt für Liste und Einzelansicht.',
        '',
        '## Gewählter Ansatz',
        '',
        'Lesezeit beim Lesen im Service berechnen.',
        '',
        '**Begründung:** Keine Migration nötig.',
        '',
        '**Verworfene Alternativen:**',
        '',
        '- **Feld in der Datenbank** — braucht eine Migration',
        '',
        '## Architektur und Komponenten',
        '',
        '### readingTime',
        '',
        '- **Zweck:** berechnet Minuten',
        '- **Schnittstelle:** readingTime(body: string): number',
        '- **Abhängigkeiten:** Keine.',
        '',
        '### articleService',
        '',
        '- **Zweck:** liefert Artikel',
        '- **Schnittstelle:** getArticle(slug)',
        '- **Abhängigkeiten:** readingTime, articleStore',
        '',
        '## Datenfluss',
        '',
        'Route → Service → readingTime → Antwort.',
        '',
        '## Fehlerbehandlung',
        '',
        'Leerer Text ergibt 1 Minute.',
        '',
        '## Akzeptanzkriterien',
        '',
        '- GET /api/articles/:slug enthält readingTimeMinutes.',
        '- Die Liste enthält das Feld je Artikel.',
        '',
        '## Tests',
        '',
        'Unit-Test für readingTime; Route-Test für das Feld.',
        '',
        '## Betroffene Dateien',
        '',
        '- `src/services/articleService.js` — Feld ergänzen',
        '- `src/utils/readingTime.js` (neu) — Berechnung',
        '',
        '## Risiken',
        '',
        '- [niedrig] Sehr lange Texte — Berechnung ist linear',
        '',
        '## Offene Punkte',
        '',
        '- Wörter pro Minute für Code-Blöcke?',
        '',
        '## Geklärte Rückfragen',
        '',
        '**F:** Wo wird die Lesezeit berechnet?\\',
        '**A:** Ansatz B: Beim Lesen',
        '',
      ].join('\n'),
    )
  })

  it('writes "Keine." for empty lists and empty text sections', () => {
    const md = renderSpec(TICKET, {
      ...SPEC,
      approach: { ...SPEC.approach, alternatives: [] },
      components: [], dataFlow: '  ', errorHandling: '', tests: '\n', affectedFiles: [], risks: [], openPoints: [],
    }, [])
    expect(md).toContain('**Verworfene Alternativen:**\n\nKeine.\n')
    for (const section of ['Architektur und Komponenten', 'Datenfluss', 'Fehlerbehandlung', 'Tests', 'Betroffene Dateien', 'Risiken', 'Offene Punkte', 'Geklärte Rückfragen']) {
      expect(md).toContain(`## ${section}\n\nKeine.\n`)
    }
  })

  it('keeps single-line fields on one line and labels every severity', () => {
    const md = renderSpec(TICKET, {
      ...SPEC,
      title: 'Lese\nzeit',
      components: [{ name: 'read\nTime', purpose: 'be\nrechnet', interface: 'f(\nx)', dependsOn: ['a\nb'] }],
      acceptanceCriteria: ['Feld\nvorhanden'],
      affectedFiles: [{ path: 'src/a.js', change: 'neu\nschreiben', isNew: false }],
      risks: [
        { description: 'A\nB', severity: 'high', mitigation: 'C\nD' },
        { description: 'E', severity: 'medium', mitigation: 'F' },
      ],
    }, [{ question: 'Frage\nzwei?', answer: 'Ja,\nklar.' }])
    expect(md).toContain('# CB-2: Lese zeit\n')
    expect(md).toContain('### read Time\n\n- **Zweck:** be rechnet\n- **Schnittstelle:** f( x)\n- **Abhängigkeiten:** a b\n')
    expect(md).toContain('## Akzeptanzkriterien\n\n- Feld vorhanden\n')
    expect(md).toContain('- `src/a.js` — neu schreiben\n')
    expect(md).toContain('## Risiken\n\n- [hoch] A B — C D\n- [mittel] E — F\n')
    expect(md).toContain('**F:** Frage zwei?\\\n**A:** Ja, klar.')
  })
})

describe('renderSpec — robustness against agent text', () => {
  it('demotes headings in multi-line text so they cannot create sections', () => {
    const md = renderSpec(TICKET, { ...SPEC, goal: 'Erst.\n## Fake\n  # Noch einer\nEnde' }, [])
    expect(md).toContain('## Ziel\n\nErst.\n\\## Fake\n  \\# Noch einer\nEnde\n')
    expect(md.split('\n').filter((line) => line.startsWith('## Fake'))).toEqual([])
  })

  it('demotes a heading inside a single-line bullet item', () => {
    const md = renderSpec(TICKET, { ...SPEC, acceptanceCriteria: ['# Kein Titel'] }, [])
    expect(md).toContain('## Akzeptanzkriterien\n\n- \\# Kein Titel\n')
  })

  it('keeps a path with backticks in one code span', () => {
    const md = renderSpec(TICKET, {
      ...SPEC, affectedFiles: [{ path: 'src/`a`.ts', change: 'neu', isNew: false }],
    }, [])
    expect(md).toContain('- `` src/`a`.ts `` — neu\n')
  })
})

describe('renderPullRequestBody — design', () => {
  it('names the spec and uses the goal as summary', () => {
    expect(renderPullRequestBody(TICKET, 'design', SPEC.goal)).toBe(
      [
        '**CB-2: Spec** für „Lesezeit bei Artikeln anzeigen“',
        '',
        'Die Artikel-API liefert eine geschätzte Lesezeit.',
        'Sie gilt für Liste und Einzelansicht.',
        '',
        'Quelle: `examples/tickets/cb-2-lesezeit.md`',
        '',
        '---',
        'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
      ].join('\n'),
    )
  })
})

describe('titleWithoutKey', () => {
  it.each([
    ['CB-1: X', 'X'],
    ['cb-1 - X', 'X'],
    ['CB-1 X', 'X'],
    ['  CB-1:   X  ', 'X'],
    ['Folge von CB-1', 'Folge von CB-1'],
    ['CB-1', 'CB-1'],
    ['CB-1: ', 'CB-1:'],
    ['CB-10: X', 'CB-10: X'],
  ])('%j -> %j', (title, expected) => {
    expect(titleWithoutKey('CB-1', title)).toBe(expected)
  })
})

describe('headings with an agent title that contains the key', () => {
  const ticket = { key: 'CB-1', sourcePath: 'x.md' }

  it('renderIntent does not repeat the key', () => {
    expect(renderIntent(ticket, { ...INTENT, title: 'CB-1: X' }, [])).toContain('\n# CB-1: X\n')
  })

  it('renderSpec does not repeat the key', () => {
    const spec = { title: 'cb-1 - X', goal: '', approach: { chosen: '', rationale: '', alternatives: [] }, components: [], dataFlow: '', errorHandling: '', acceptanceCriteria: [], tests: '', affectedFiles: [], risks: [], openPoints: [] } as unknown as Spec
    expect(renderSpec(ticket, spec, [])).toContain('\n# CB-1: X\n')
  })
})
