import { and, desc, eq, sql } from 'drizzle-orm'
import type { ArtifactRepository } from '../../ports'
import type { SqliteDb } from './database'
import { artifacts } from './schema'

/** Insertion order; `created_at` has only second precision. */
const insertionOrder = sql`rowid`

/** `ArtifactRepository` on the `artifacts` table. @throws when an update hits no row (unknown id). */
export function createSqliteArtifactRepository(db: SqliteDb): ArtifactRepository {
  const requireUpdated = (row: unknown, id: string) => {
    if (!row) throw new Error(`Artifact ${id} not found`)
  }

  return {
    create: (input) => db.insert(artifacts).values(input).returning().get(),

    listForTicket: (ticketKey) =>
      db.select().from(artifacts).where(eq(artifacts.ticketKey, ticketKey)).orderBy(insertionOrder).all(),

    findOpen: (ticketKey, stage) =>
      db.select().from(artifacts)
        .where(and(eq(artifacts.ticketKey, ticketKey), eq(artifacts.stage, stage), eq(artifacts.prState, 'open')))
        .orderBy(desc(insertionOrder))
        .limit(1)
        .get() ?? null,

    markMerged(id, mergedAt) {
      requireUpdated(db.update(artifacts).set({ prState: 'merged', mergedAt }).where(eq(artifacts.id, id)).returning().get(), id)
    },

    markClosed(id) {
      requireUpdated(db.update(artifacts).set({ prState: 'closed' }).where(eq(artifacts.id, id)).returning().get(), id)
    },
  }
}
