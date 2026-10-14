import { eq } from 'drizzle-orm'
import { db } from './client'
import { agentRuns, tickets } from './schema'
import { findStuckRuns } from './agentRuns'
import { resetToSeeds } from './tickets'

/**
 * Inserts the three seed tickets if the tickets table is empty.
 * Should be called once at process startup.
 */
export function seedIfEmpty(): void {
  const count = db.select().from(tickets).all().length
  if (count === 0) {
    resetToSeeds()
    console.log('[startup] seeded 3 default tickets')
  }
}

/**
 * Recovers runs that were left in `'running'` state after an unclean shutdown.
 * Should be called once at process startup before serving requests.
 */
export function recoverStuckRuns(): void {
  const stuck = findStuckRuns()
  for (const run of stuck) {
    db.transaction((tx) => {
      tx.update(agentRuns).set({ status: 'failed', finishedAt: new Date() }).where(eq(agentRuns.id, run.id)).run()
      tx.update(tickets).set({ status: 'failed', updatedAt: new Date() }).where(eq(tickets.id, run.ticketId)).run()
    })
    console.log(`[startup] recovered stuck run ${run.id} for ticket ${run.ticketId}`)
  }
  if (stuck.length > 0) {
    console.log(`[startup] recovered ${stuck.length} stuck run(s)`)
  }
}
