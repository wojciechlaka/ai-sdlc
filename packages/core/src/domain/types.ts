import type { AgentOutput, RunStatus, RunTrigger, TicketStatus } from '@refinement/shared'

export type { TicketStatus, RunStatus, RunTrigger }

export interface QAPair {
  question: string
  answer: string
}

/** Snapshot of everything a run was started with; persisted with the run. */
export interface AgentRunInput {
  ticketTitle: string
  ticketDescription: string
  acceptanceCriteria: string
  repo: string
  model: string
  previousRuns?: QAPair[]
  feedback?: string
}

export interface Ticket {
  id: number
  title: string
  description: string
  status: TicketStatus
  iteration: number
  createdAt: Date
  updatedAt: Date
}

export interface AgentRun {
  id: string
  ticketId: number
  iteration: number
  trigger: RunTrigger
  input: AgentRunInput
  output: AgentOutput | null
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
