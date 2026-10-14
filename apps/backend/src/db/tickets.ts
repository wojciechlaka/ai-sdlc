import { eq, sql } from 'drizzle-orm'
import { db } from './client'
import { tickets } from './schema'
import type { TicketStatus } from './schema'

export type { TicketStatus }
export type TicketRow = typeof tickets.$inferSelect

/**
 * Converts a numeric DB id to the public `T-{id}` format used in the API and UI.
 * @param id - Numeric ticket ID from the database.
 */
export function formatTicketId(id: number): string {
  return `T-${id}`
}

/**
 * Parses a `T-{id}` string back to a numeric id. Throws on invalid format.
 * @param formatted - Public ticket ID string, e.g. `T-42`.
 */
export function parseTicketId(formatted: string): number {
  const match = /^T-(\d+)$/.exec(formatted)
  if (!match) throw new Error(`Invalid ticket ID: ${formatted}`)
  return parseInt(match[1], 10)
}

export function createTicket(input: { title: string; description: string }): TicketRow {
  return db.insert(tickets).values({ title: input.title, description: input.description }).returning().get()
}

/**
 * Throws if the ticket does not exist.
 * @param id - Numeric ticket ID.
 */
export function getTicket(id: number): TicketRow {
  const row = db.select().from(tickets).where(eq(tickets.id, id)).get()
  if (!row) throw new Error(`Ticket ${id} not found`)
  return row
}

export function listTickets(): TicketRow[] {
  return db.select().from(tickets).all()
}

export function updateTicketStatus(id: number, status: TicketStatus): void {
  const row = db.update(tickets).set({ status, updatedAt: new Date() }).where(eq(tickets.id, id)).returning().get()
  if (!row) throw new Error(`Ticket ${id} not found`)
}

export function incrementIteration(id: number): void {
  const row = db.update(tickets)
    .set({ iteration: sql`${tickets.iteration} + 1`, updatedAt: new Date() })
    .where(eq(tickets.id, id))
    .returning()
    .get()
  if (!row) throw new Error(`Ticket ${id} not found`)
}

/**
 * Throws if the ticket does not exist. Caller must verify ticket is not `'refining'` before deleting.
 * @param id - Numeric ticket ID.
 */
export function deleteTicket(id: number): void {
  const row = db.delete(tickets).where(eq(tickets.id, id)).returning().get()
  if (!row) throw new Error(`Ticket ${id} not found`)
}

const SEED_TICKETS = [
  {
    title: 'CC-1: Eigene Fragen hinzufügen',
    description: 'Aktuell gibt es nur die fest eingebauten Fragen. Mehrere Teams haben gefragt, ob sie eigene Fragen verwenden können, z. B. firmenspezifische oder zum aktuellen Teamevent. Der Host sollte beim Erstellen des Spiels irgendwie eigene Fragen eingeben können.',
  },
  {
    title: 'CC-2: Timer für die Antwortphase',
    description: 'Manche Runden ziehen sich ewig, weil einzelne Spieler nicht antworten. Es wäre gut, wenn es ein Zeitlimit gäbe, damit das Spiel weitergeht. Der Host sollte das vielleicht einstellen können.',
  },
  {
    title: 'CC-3: Spieler fliegen bei Verbindungsabbruch raus',
    description: 'Wenn jemand kurz die Verbindung verliert (Laptop zugeklappt, WLAN-Wechsel), ist er aus dem Spiel raus und die Runde hängt. Spieler sollten wieder reinkommen können, ohne dass das Spiel kaputtgeht.',
  },
]

/** Deletes all tickets (and cascades to runs/events) then inserts the three seed tickets. */
export function resetToSeeds(): TicketRow[] {
  db.delete(tickets).run()
  return SEED_TICKETS.map(({ title, description }) =>
    db.insert(tickets).values({ title, description }).returning().get()
  )
}
