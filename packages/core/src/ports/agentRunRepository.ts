import type { StageOutput } from '@refinement/shared'
import type { AgentRun, AgentRunInput, ArtifactStage, RunTrigger } from '../domain/types'

export interface RunCompletion {
  output: StageOutput
  costUsd: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
}

export interface AgentRunRepository {
  /** Creates a `running` run with the next `seq` of its ticket. @throws if the ticket does not exist. */
  create(input: { ticketKey: string; stage: ArtifactStage; trigger: RunTrigger; input: AgentRunInput; model: string }): AgentRun
  findById(id: string): AgentRun | null
  /** Marks the run `succeeded` — for questions and results alike. */
  complete(id: string, result: RunCompletion): void
  fail(id: string, status: 'failed' | 'timeout'): void
  /** Runs of a ticket in `seq` order, optionally of one stage only. */
  listForTicket(ticketKey: string, stage?: ArtifactStage): AgentRun[]
  /** Runs still `running` — survivors of a restart. */
  findStuck(): AgentRun[]
}
