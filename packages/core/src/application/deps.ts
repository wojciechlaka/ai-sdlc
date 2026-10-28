import type {
  AgentRunner,
  AgentRunRepository,
  AuditLog,
  EventPublisher,
  RepoProvider,
  TicketRepository,
} from '../ports'

export interface UseCaseDeps {
  tickets: TicketRepository
  runs: AgentRunRepository
  audit: AuditLog
  agent: AgentRunner
  repos: RepoProvider
  events: EventPublisher
  /** Receives fire-and-forget work (agent runs). The production implementation logs rejections. */
  runInBackground: (task: Promise<void>) => void
  /** Pause after stopping an agent before the ticket state is read again (process needs time to exit). */
  stopSettleMs: number
}
