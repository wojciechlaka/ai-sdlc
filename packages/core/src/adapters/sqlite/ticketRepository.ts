import { eq } from 'drizzle-orm'
import type { TicketRepository } from '../../ports'
import { compareTicketKeys } from '../../domain/ticketKey'
import type { SqliteDb } from './database'
import { tickets } from './schema'

/** `TicketRepository` on the `tickets` table; lists in key order (CB-2 before CB-10). */
export function createSqliteTicketRepository(db: SqliteDb): TicketRepository {
  return {
    list: () => db.select().from(tickets).all().sort((a, b) => compareTicketKeys(a.key, b.key)),

    findByKey: (key) => db.select().from(tickets).where(eq(tickets.key, key)).get() ?? null,

    upsertFromSource(items) {
      return db.transaction((tx) => {
        const created: string[] = []
        for (const item of items) {
          const fields = { title: item.title, description: item.description, priority: item.priority, sourcePath: item.sourcePath }
          const existing = tx.select({ key: tickets.key }).from(tickets).where(eq(tickets.key, item.key)).get()
          if (existing) {
            tx.update(tickets).set({ ...fields, updatedAt: new Date() }).where(eq(tickets.key, item.key)).run()
          } else {
            tx.insert(tickets).values({ key: item.key, ...fields }).run()
            created.push(item.key)
          }
        }
        return created
      })
    },

    update(key, patch) {
      const row = db.update(tickets).set({ ...patch, updatedAt: new Date() }).where(eq(tickets.key, key)).returning().get()
      if (!row) {
        throw new Error(`Ticket ${key} not found`)
      }
      return row
    },

    clear() {
      db.delete(tickets).run()
    },
  }
}
