export type AuditActor = 'human' | 'agent' | 'system'

export interface AuditLog {
  append(event: { ticketId: number; actor: AuditActor; type: string; payload?: unknown }): void
}
