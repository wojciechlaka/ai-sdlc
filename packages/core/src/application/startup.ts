import { SEED_TICKETS } from '../domain/seeds'
import type { UseCaseDeps } from './deps'

/**
 * Runs once at process start, before requests are served:
 * seeds an empty database and fails runs that were interrupted by a crash.
 */
export function startup(deps: UseCaseDeps): void {
  if (deps.tickets.count() === 0) {
    deps.tickets.replaceAll(SEED_TICKETS)
    console.log(`[startup] seeded ${SEED_TICKETS.length} default tickets`)
  }

  const stuck = deps.runs.findStuck()
  for (const run of stuck) {
    deps.runs.fail(run.id, 'failed')
    deps.tickets.updateStatus(run.ticketId, 'failed')
    console.log(`[startup] recovered stuck run ${run.id} for ticket ${run.ticketId}`)
  }
  if (stuck.length > 0) console.log(`[startup] recovered ${stuck.length} stuck run(s)`)
}
