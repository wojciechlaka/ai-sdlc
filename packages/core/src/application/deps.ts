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

/** Ports and settings every use case receives; wired by compose.ts (production) or createTestContext (tests). */
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
  /** Branch of the target repository the app works on (`showcase`); the code host is configured with the same name. */
  baseBranch: string
  /** Tag that marks the initial state of the base branch (`showcase-base`); named in startup warnings. */
  baselineTag: string
  /** Receives fire-and-forget work (agent runs). The production implementation logs rejections. */
  runInBackground: (task: Promise<void>) => void
  /** In-process state shared by all use cases; `resetting` is set while `resetSystem` runs. */
  resetState: { resetting: boolean }
  /** Pause after stopping an agent before the ticket state is read again (process needs time to exit). */
  stopSettleMs: number
}
