import type { StageOutput } from '@refinement/shared'
import type { AgentRun, AgentRunInput, ArtifactStage, RunTrigger } from '../domain/types'

/** What a succeeded run stores: its validated output and the usage reported by the CLI. */
export interface RunCompletion {
  /** Question or result of the stage agent. */
  output: StageOutput
  /** Cost reported by the CLI, in USD. */
  costUsd: number
  /** Uncached input tokens. */
  inputTokens: number
  /** Input tokens written to the prompt cache. */
  cacheCreationTokens: number
  /** Input tokens read from the prompt cache. */
  cacheReadTokens: number
  /** Generated tokens. */
  outputTokens: number
}

/** Persistent attempts (`AgentRun`) per ticket and stage. */
export interface AgentRunRepository {
  /** Creates a `running` run with the next `seq` of its ticket. @throws if the ticket does not exist. */
  create(input: { ticketKey: string; stage: ArtifactStage; trigger: RunTrigger; input: AgentRunInput; model: string }): AgentRun
  /** The run, or null for an unknown id (e.g. removed by a reset). */
  findById(id: string): AgentRun | null
  /** Marks the run `succeeded` — for questions and results alike. */
  complete(id: string, result: RunCompletion): void
  /** Ends the run without output; usage of a discarded result stays only in the log. */
  fail(id: string, status: 'failed' | 'timeout'): void
  /** Runs of a ticket in `seq` order, optionally of one stage only. */
  listForTicket(ticketKey: string, stage?: ArtifactStage): AgentRun[]
  /** Runs still `running` — survivors of a restart. */
  findStuck(): AgentRun[]
}
