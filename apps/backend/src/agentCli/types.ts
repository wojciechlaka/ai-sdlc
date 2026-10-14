import type { AgentOutput } from '@refinement/shared'
import type { SchemaValidationError } from './errors'
import type { QAPair } from './prompt'

export interface ClaudeStreamMessage {
  content?: Array<Record<string, unknown>>
}

export interface ClaudeTokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface ExtractedResult {
  text: string
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export type AttemptResult =
  | { ok: true; output: AgentOutput; cliResult: ExtractedResult }
  | { ok: false; cliResult: ExtractedResult; error: SchemaValidationError }

export interface RefinementInput {
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

export interface RefinementMeta {
  model: string
  durationSeconds: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export interface RefinementResult {
  output: AgentOutput
  meta: RefinementMeta
}
