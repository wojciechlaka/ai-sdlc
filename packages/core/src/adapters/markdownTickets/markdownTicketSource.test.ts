import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createMarkdownTicketSource, parseTicketMarkdown } from './markdownTicketSource'

const REPO_ROOT = path.resolve(__dirname, '../../../../..')

/** Writes the files into `<tmp>/tickets` and returns `<tmp>`. */
function writeTickets(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tickets-'))
  fs.mkdirSync(path.join(root, 'tickets'))
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, 'tickets', name), content)
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseTicketMarkdown', () => {
  it('reads key, title, description and priority', () => {
    const md = '# CB-2: Lesezeit anzeigen\n\nLeser wollen es wissen.\nZweite Zeile.\n\n**Priorität:** Mittel\n'
    expect(parseTicketMarkdown(md, 'x/cb-2.md')).toEqual({
      key: 'CB-2', title: 'Lesezeit anzeigen', description: 'Leser wollen es wissen.\nZweite Zeile.',
      priority: 'Mittel', sourcePath: 'x/cb-2.md',
    })
  })

  it('accepts files without priority and with Windows line endings', () => {
    expect(parseTicketMarkdown('# CB-9: T\r\n\r\nText\r\n', 'a.md')).toMatchObject({ description: 'Text', priority: null })
  })

  it('strips a UTF-8 BOM', () => {
    expect(parseTicketMarkdown('\uFEFF# CB-4: T\n\nText', 'a.md')).toMatchObject({ key: 'CB-4', title: 'T' })
  })

  it('rejects an empty title', () => {
    expect(parseTicketMarkdown('# CB-5:   \n\nText', 'a.md')).toBeNull()
  })

  it('returns null without a ticket heading in the first line', () => {
    expect(parseTicketMarkdown('# Seed-Tickets\n\nText', 'README.md')).toBeNull()
    expect(parseTicketMarkdown('Text\n# CB-1: T', 'a.md')).toBeNull()
  })
})

describe('createMarkdownTicketSource', () => {
  it('reads all ticket files sorted by key, with paths relative to the root', () => {
    const root = writeTickets({
      'cb-10-x.md': '# CB-10: Zehn\n\nText',
      'cb-2-y.md': '# CB-2: Zwei\n\nText',
      'README.md': '# Tickets\n\nAnleitung',
      'notes.txt': '# CB-3: kein Markdown',
    })
    const source = createMarkdownTicketSource({ dir: path.join(root, 'tickets'), rootDir: root })
    expect(source.list().map((t) => [t.key, t.sourcePath])).toEqual([
      ['CB-2', 'tickets/cb-2-y.md'],
      ['CB-10', 'tickets/cb-10-x.md'],
    ])
  })

  it('warns about malformed files and duplicate keys and skips them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = writeTickets({
      'a.md': '# CB-1: Erste\n\nText',
      'b.md': '# CB-1: Doppelt\n\nText',
      'c.md': 'kein Ticket',
    })
    const source = createMarkdownTicketSource({ dir: path.join(root, 'tickets'), rootDir: root })
    expect(source.list().map((t) => t.title)).toEqual(['Erste'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('reads the shipped example tickets', () => {
    const source = createMarkdownTicketSource({ dir: path.join(REPO_ROOT, 'examples', 'tickets'), rootDir: REPO_ROOT })
    const tickets = source.list()
    expect(tickets.map((t) => t.key)).toEqual(['CB-1', 'CB-2', 'CB-3'])
    expect(tickets[1]).toMatchObject({
      title: 'Lesezeit bei Artikeln anzeigen', priority: 'Mittel', sourcePath: 'examples/tickets/cb-2-lesezeit.md',
    })
    expect(tickets[1]?.description).toMatch(/^Leser möchten vorher sehen/)
  })
})
