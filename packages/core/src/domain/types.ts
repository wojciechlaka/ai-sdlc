import type { ArtifactStage, PrState, Stage, StageOutput, TicketState } from '@refinement/shared'

export type { ArtifactStage, PrState, Stage, StageOutput, TicketState }

/** A question of the agent and the human answer to it. */
export interface QAPair {
  question: string
  answer: string
}

/** What started a run: the stage start or an answer to a question. */
export type RunTrigger = 'initial' | 'answer'
/** Life cycle of a run; `running` until it succeeds, fails or times out. */
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

/** A ticket in the app: the source fields plus where it stands in the playbook. */
export interface Ticket extends SourceTicket {
  stage: Stage
  state: TicketState
  createdAt: Date
  updatedAt: Date
}

/** Snapshot of what a run was started with; the answer run continues from it. */
export interface AgentRunInput {
  model: string
  /** Q&A history of the stage up to this run; empty for the first run. */
  answeredQuestions: QAPair[]
}

/** One attempt of a stage agent (see `isCurrentRun`), with its input snapshot, output and usage. */
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
