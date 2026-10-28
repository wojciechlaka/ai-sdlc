import type { AgentOutput } from '@refinement/shared'
import type { QAPair } from '../domain/types'

export interface AgentRunnerInput {
  /** Public ticket id (`T-{n}`); also the key for `stop`. */
  ticketId: string
  title: string
  description: string
  acceptanceCriteria: string
  repoPath: string
  model: string
  codebaseSummary?: string
  feedback?: string
  previousRuns?: QAPair[]
}

export interface AgentRunMeta {
  model: string
  durationSeconds: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export interface AgentRunResult {
  output: AgentOutput
  meta: AgentRunMeta
}

export interface AgentRunner {
  /**
   * Runs the refinement agent and returns its validated output.
   * @throws {AgentRunTerminatedError} when stopped via `stop`.
   * @throws {AgentRunTimeoutError} when the run exceeds its time limit.
   */
  run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult>
  /** Stops the running agent for the ticket. Returns false if none is running. */
  stop(ticketId: string): boolean
}

/** The run was stopped on user request. */
export class AgentRunTerminatedError extends Error {
  constructor() {
    super('Refinement was terminated by user')
    this.name = 'AgentRunTerminatedError'
  }
}

/** The agent did not finish within its time limit. */
export class AgentRunTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude did not respond within ${timeoutMs}ms`)
    this.name = 'AgentRunTimeoutError'
  }
}
