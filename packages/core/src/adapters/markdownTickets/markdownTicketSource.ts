import fs from 'fs'
import path from 'path'
import type { TicketSource } from '../../ports'
import type { ExternalTicket } from '../../domain/types'
import { TICKET_KEY_PATTERN, compareTicketKeys } from '../../domain/ticketKey'

/** First line of a ticket file: `# CB-3: Titel`. */
const HEADING_RE = new RegExp(`^#\\s+(?<key>${TICKET_KEY_PATTERN}):\\s*(?<title>\\S.*?)\\s*$`)
/** Optional line anywhere in the body: `**Priorität:** Hoch`. */
const PRIORITY_RE = /^\*\*Priorität:\*\*\s*(?<priority>.+?)\s*$/
/** Byte order mark some editors put at the start of a UTF-8 file. */
const LEADING_BOM_RE = /^\uFEFF/
/** Windows line endings, normalised to `\n`. */
const CRLF_RE = /\r\n/g
const TICKET_FILE_EXTENSION = '.md'
const TICKET_FILE_ENCODING = 'utf-8'
/** Explains the folder; not a ticket, so it is skipped without a warning. */
const README = 'README.md'

/**
 * Parses one ticket file: `# CB-3: Titel` in the first line, free text, optional `**Priorität:** …` line.
 * Returns null when the first line is no ticket heading (e.g. README.md).
 */
export function parseTicketMarkdown(markdown: string, sourcePath: string): ExternalTicket | null {
  const [firstLine = '', ...bodyLines] = markdown.replace(LEADING_BOM_RE, '').replace(CRLF_RE, '\n').split('\n')
  const heading = HEADING_RE.exec(firstLine)?.groups
  if (!heading) {
    return null
  }

  let priority: string | null = null
  const body: string[] = []
  for (const line of bodyLines) {
    const match = PRIORITY_RE.exec(line)?.groups
    if (match) {
      priority = match.priority!
    } else {
      body.push(line)
    }
  }
  return { key: heading.key!, title: heading.title!, description: body.join('\n').trim(), priority, sourcePath }
}

/** Where the ticket files live and what their `sourcePath` is relative to. */
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
      if (!fs.existsSync(options.dir)) {
        throw new Error(`Ticket-Ordner fehlt: ${options.dir}`)
      }
      const tickets: ExternalTicket[] = []
      const seen = new Set<string>()
      const names = fs.readdirSync(options.dir).filter((name) => name.endsWith(TICKET_FILE_EXTENSION)).sort()

      for (const name of names) {
        const file = path.join(options.dir, name)
        const sourcePath = path.relative(options.rootDir, file).split(path.sep).join('/')
        const ticket = parseTicketMarkdown(fs.readFileSync(file, TICKET_FILE_ENCODING), sourcePath)
        if (!ticket) {
          if (name !== README) {
            console.warn(`[tickets] ${sourcePath}: first line is not a heading "# KEY-n: Title" — skipped`)
          }
          continue
        }
        if (seen.has(ticket.key)) {
          console.warn(`[tickets] ${sourcePath}: duplicate key ${ticket.key} — skipped`)
          continue
        }
        seen.add(ticket.key)
        tickets.push(ticket)
      }
      return tickets.sort((a, b) => compareTicketKeys(a.key, b.key))
    },
  }
}
