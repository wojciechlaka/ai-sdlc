import type { UseCaseDeps } from './deps'
import type { Reporter } from './reporter'

/** Ends a stage attempt as `failed`: server log, progress event and a log entry for the ticket page. */
export function failStage(deps: Pick<UseCaseDeps, 'audit'>, reporter: Reporter, ticketKey: string, message: string): void {
  reporter.log(`ERROR: ${message}`)
  reporter.progress(`Fehler: ${message}`)
  deps.audit.append({ ticketKey, actor: 'system', type: 'error', payload: { message } })
  reporter.setState('failed')
}
