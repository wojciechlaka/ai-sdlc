import type { ArtifactStage, PrState, Stage, StageOutput, TicketState } from '@refinement/shared'

export type { ArtifactStage, PrState, Stage, StageOutput, TicketState }

export interface QAPair {
  question: string
  answer: string
}

export type RunTrigger = 'initial' | 'answer'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'timeout'

/** One ticket as the ticket source (simulated Jira) delivers it. */
export interface SourceTicket {
  key: string
  title: string
  description: string
  priority: string | null
  /** Relative to the repository root, `/`-separated. */
  sourcePath: string
}

export interface Ticket extends SourceTicket {
  stage: Stage
  state: TicketState
  createdAt: Date
  updatedAt: Date
}

/** Snapshot of what a run was started with; the answer run continues from it. */
export interface AgentRunInput {
  model: string
  previousRuns: QAPair[]
}

export interface AgentRun {
  id: string
  ticketKey: string
  stage: ArtifactStage
  /** Running number per ticket, starting at 1. */
  seq: number
  trigger: RunTrigger
  input: AgentRunInput
  output: StageOutput | null
  status: RunStatus
  model: string
  costUsd: number | null
  inputTokens: number | null
  cacheCreationTokens: number | null
  cacheReadTokens: number | null
  outputTokens: number | null
  startedAt: Date
  finishedAt: Date | null
}

/** A file the app proposed via branch + PR. The content lives in Git, not here. */
export interface Artifact {
  id: string
  ticketKey: string
  stage: ArtifactStage
  path: string
  branch: string
  prNumber: number
  prUrl: string
  prState: PrState
  mergedAt: Date | null
  createdAt: Date
}
