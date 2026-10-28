import type { StageOutput } from '@refinement/shared'
import type { ArtifactStage, QAPair } from '../domain/types'

export interface AgentRunnerInput {
  /** Ticket key; also the handle for `stop`. */
  ticketKey: string
  /** Selects skill and output schema. */
  stage: ArtifactStage
  title: string
  description: string
  /** Local clone of the target repository. */
  repoPath: string
  model: string
  codebaseSummary?: string
  /** Answered questions of earlier runs of this stage. */
  previousRuns: QAPair[]
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
  output: StageOutput
  meta: AgentRunMeta
}

/**
 * One tool call of the agent, reported by the guard and audit hooks (spec §13).
 * `blocked`: the guard denied the call (`reason`); `used`: the call ran (`exitCode` for Bash, if known).
 */
export interface ToolEvent {
  kind: 'blocked' | 'used'
  /** Tool name, e.g. `Bash`, `Read`. */
  tool: string
  /** Command, file or pattern of the call (shortened). */
  target: string
  reason?: string
  exitCode?: number
}

/** Callbacks the agent reports through while it runs. */
export interface AgentRunCallbacks {
  /** Short status text for the UI. */
  onProgress(message: string): void
  /** Every tool call the hooks saw, in order. */
  onToolEvent(event: ToolEvent): void
}

export interface AgentRunner {
  /**
   * Runs the agent of the stage and returns its validated output.
   * @throws {AgentRunTerminatedError} when stopped via `stop`.
   * @throws {AgentRunTimeoutError} when the run exceeds its time limit.
   */
  run(input: AgentRunnerInput, callbacks: AgentRunCallbacks): Promise<AgentRunResult>
  /** Stops the running agent of the ticket. Returns false if none is running. */
  stop(ticketKey: string): boolean
}

/** The run was stopped on user request. */
export class AgentRunTerminatedError extends Error {
  constructor() {
    super('Agent run was terminated by user')
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
