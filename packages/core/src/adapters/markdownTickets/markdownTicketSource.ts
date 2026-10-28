import fs from 'fs'
import path from 'path'
import type { TicketSource } from '../../ports'
import type { SourceTicket } from '../../domain/types'
import { TICKET_KEY_PATTERN, compareTicketKeys } from '../../domain/ticketKey'

const HEADING_RE = new RegExp(`^#\\s+(${TICKET_KEY_PATTERN}):\\s*(\\S.*?)\\s*$`)
const PRIORITY_RE = /^\*\*Priorität:\*\*\s*(.+?)\s*$/
const README = 'README.md'

/**
 * Parses one ticket file: `# CB-3: Titel` in the first line, free text, optional `**Priorität:** …` line.
 * Returns null when the first line is no ticket heading (e.g. README.md).
 */
export function parseTicketMarkdown(markdown: string, sourcePath: string): SourceTicket | null {
  const lines = markdown.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n')
  const heading = HEADING_RE.exec(lines[0] ?? '')
  if (!heading) return null

  let priority: string | null = null
  const body: string[] = []
  for (const line of lines.slice(1)) {
    const match = PRIORITY_RE.exec(line)
    if (match) priority = match[1]!
    else body.push(line)
  }
  return { key: heading[1]!, title: heading[2]!, description: body.join('\n').trim(), priority, sourcePath }
}

export interface MarkdownTicketSourceOptions {
  /** Directory with the ticket files, e.g. `examples/tickets`. */
  dir: string
  /** `sourcePath` is relative to this directory (the repository root). */
  rootDir: string
}

/**
 * Ticket source of the showcase: every `*.md` file in `dir` simulates one Jira ticket.
 * Read on every call, so a new file shows up after a restart or reset.
 */
export function createMarkdownTicketSource(options: MarkdownTicketSourceOptions): TicketSource {
  return {
    list() {
      if (!fs.existsSync(options.dir)) throw new Error(`Ticket-Ordner fehlt: ${options.dir}`)
      const tickets: SourceTicket[] = []
      const seen = new Set<string>()
      const names = fs.readdirSync(options.dir).filter((name) => name.endsWith('.md')).sort()

      for (const name of names) {
        const file = path.join(options.dir, name)
        const sourcePath = path.relative(options.rootDir, file).split(path.sep).join('/')
        const ticket = parseTicketMarkdown(fs.readFileSync(file, 'utf-8'), sourcePath)
        if (!ticket) {
          if (name !== README) console.warn(`[tickets] ${sourcePath}: erste Zeile ist keine Überschrift "# KEY-n: Titel" — übersprungen`)
          continue
        }
        if (seen.has(ticket.key)) {
          console.warn(`[tickets] ${sourcePath}: Schlüssel ${ticket.key} kommt doppelt vor — übersprungen`)
          continue
        }
        seen.add(ticket.key)
        tickets.push(ticket)
      }
      return tickets.sort((a, b) => compareTicketKeys(a.key, b.key))
    },
  }
}
