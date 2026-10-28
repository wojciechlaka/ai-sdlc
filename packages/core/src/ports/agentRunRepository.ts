import type { AgentOutput } from '@refinement/shared'
import type { AgentRun, AgentRunInput, RunTrigger } from '../domain/types'

export interface RunCompletion {
  output: AgentOutput
  costUsd: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
}

export interface AgentRunRepository {
  /** Creates a `running` run and atomically increments the ticket's iteration counter. */
  create(input: { ticketId: number; trigger: RunTrigger; input: AgentRunInput; model: string }): AgentRun
  findById(id: string): AgentRun | null
  /** Marks the run `succeeded` — for both `question` and `refinement` outputs. */
  complete(id: string, result: RunCompletion): void
  fail(id: string, status: 'failed' | 'timeout'): void
  /** All runs of a ticket in iteration order. */
  listForTicket(ticketId: number): AgentRun[]
  latestForTicket(ticketId: number): AgentRun | null
  /** Runs still `running` — survivors of an unclean shutdown. */
  findStuck(): AgentRun[]
}
