import { eq } from 'drizzle-orm'
import type { TicketRepository } from '../../ports'
import type { SqliteDb } from './database'
import { tickets } from './schema'

export function createSqliteTicketRepository(db: SqliteDb): TicketRepository {
  const insert = (input: { title: string; description: string }) =>
    db.insert(tickets).values({ title: input.title, description: input.description }).returning().get()

  return {
    list: () => db.select().from(tickets).all(),

    findById: (id) => db.select().from(tickets).where(eq(tickets.id, id)).get() ?? null,

    count: () => db.select().from(tickets).all().length,

    create: insert,

    updateStatus(id, status) {
      const row = db.update(tickets).set({ status, updatedAt: new Date() }).where(eq(tickets.id, id)).returning().get()
      if (!row) throw new Error(`Ticket ${id} not found`)
    },

    delete(id) {
      const row = db.delete(tickets).where(eq(tickets.id, id)).returning().get()
      if (!row) throw new Error(`Ticket ${id} not found`)
    },

    replaceAll(newTickets) {
      db.delete(tickets).run()
      return newTickets.map(insert)
    },
  }
}
