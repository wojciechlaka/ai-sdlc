import type {
  AgentRunner,
  AgentRunRepository,
  ArtifactRepository,
  AuditLog,
  CodeHost,
  EventPublisher,
  RepoProvider,
  TicketRepository,
  TicketSource,
} from '../ports'

export interface UseCaseDeps {
  tickets: TicketRepository
  runs: AgentRunRepository
  artifacts: ArtifactRepository
  audit: AuditLog
  source: TicketSource
  /** null without `GITHUB_TOKEN`: the app cannot read stages from or write artifacts to the target repo. */
  codeHost: CodeHost | null
  agent: AgentRunner
  repos: RepoProvider
  events: EventPublisher
  /** Target repository (`TARGET_REPO`): cloned for the agent, linked in the UI. */
  repoUrl: string
  /** Receives fire-and-forget work (agent runs). The production implementation logs rejections. */
  runInBackground: (task: Promise<void>) => void
  /** Pause after stopping an agent before the ticket state is read again (process needs time to exit). */
  stopSettleMs: number
}
