import type { AuditActor, AuditEventType, AuditPayloads } from '../ports'
import type { UseCaseDeps } from './deps'

/**
 * Writes one entry to the ticket log shown on the ticket page. The payload type follows from `type`
 * (contract in `packages/shared/src/auditEvents.ts`); its texts are German.
 */
export function record<T extends AuditEventType>(
  deps: Pick<UseCaseDeps, 'audit'>,
  ticketKey: string,
  actor: AuditActor,
  type: T,
  payload: AuditPayloads[T],
): void {
  deps.audit.append({ ticketKey, actor, type, payload })
}
