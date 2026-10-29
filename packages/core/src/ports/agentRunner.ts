import type { StageOutput } from '@refinement/shared'
import type { ArtifactStage, QAPair } from '../domain/types'

/** Everything one agent run needs: ticket, stage, local checkout, model and the Q&A history. */
export interface AgentRunnerInput {
  /** Ticket key; also the handle for `stop`. */
  ticketKey: string
  /** Selects skill and output schema. */
  stage: ArtifactStage
  /** Ticket title, quoted in the prompt. */
  title: string
  /** Ticket text (Markdown), quoted in the prompt. */
  description: string
  /** Local clone of the target repository. */
  repoDir: string
  /** Claude model id, e.g. `claude-sonnet-4-6`. */
  model: string
  /** Summary of the checkout from `RepoProvider.ensureSummary`; absent when it failed. */
  codebaseSummary?: string
  /** Answered questions of earlier runs of this stage. */
  answeredQuestions: QAPair[]
}

/** Usage of a run (summed over a schema retry), stored on the AgentRun and shown in the log. */
export interface AgentRunMeta {
  /** Model the run used. */
  model: string
  /** Wall-clock duration of the Claude calls. */
  durationSeconds: number
  /** Uncached input tokens. */
  inputTokens: number
  /** Input tokens written to the prompt cache. */
  cacheCreationTokens: number
  /** Input tokens read from the prompt cache. */
  cacheReadTokens: number
  /** Generated tokens. */
  outputTokens: number
  /** Cost reported by the CLI, in USD. */
  costUsd: number
}

/** Validated stage output plus its usage. */
export interface AgentRunResult {
  /** Question or result, validated against the stage's schema. */
  output: StageOutput
  /** Usage of the run. */
  meta: AgentRunMeta
}

/**
 * One tool call of the agent, reported by the guard and audit hooks (spec §13).
 * `blocked`: the guard denied the call (`reason`); `used`: the call ran.
 */
export interface ToolEvent {
  /** `blocked`: denied by the guard; `used`: the call ran. */
  kind: 'blocked' | 'used'
  /** Tool name, e.g. `Bash`, `Read`. */
  tool: string
  /** Command, file or pattern of the call (shortened). */
  target: string
  /** German deny reason of the guard; only for `blocked`. */
  reason?: string
}

/** Callbacks the agent reports through while it runs. */
export interface AgentRunCallbacks {
  /** Short status text for the UI. */
  onProgress(message: string): void
  /** Every tool call the hooks saw, in order. */
  onToolEvent(event: ToolEvent): void
}

/** Port of the agent that writes a stage's artifact (production: the `claude` CLI). */
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

/**
 * The run was stopped on user request. The message stays internal (English): `executeRun` shows its own German text.
 */
export class AgentRunTerminatedError extends Error {
  constructor() {
    super('Agent run was terminated by user')
    this.name = 'AgentRunTerminatedError'
  }
}

/** The agent did not finish within its time limit. German message: `failStage` shows it on the ticket page. */
export class AgentRunTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude hat nicht innerhalb von ${timeoutMs} ms geantwortet`)
    this.name = 'AgentRunTimeoutError'
  }
}
