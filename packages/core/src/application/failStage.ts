import type { UseCaseDeps } from './deps'
import type { Reporter } from './reporter'
import { record } from './auditTrail'

/** Ends a stage attempt as `failed`: server log, progress event and a log entry for the ticket page. */
export function failStage(deps: Pick<UseCaseDeps, 'audit'>, reporter: Reporter, ticketKey: string, message: string): void {
  reporter.log(`ERROR: ${message}`)
  reporter.progress(`Fehler: ${message}`)
  record(deps, ticketKey, 'system', 'error', { message })
  reporter.setState('failed')
}
