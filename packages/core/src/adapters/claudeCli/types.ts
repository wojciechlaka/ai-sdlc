import type { StageOutput } from '@refinement/shared'
import type { SchemaValidationError } from './errors'

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
  | { ok: true; output: StageOutput; cliResult: ExtractedResult }
  | { ok: false; cliResult: ExtractedResult; error: SchemaValidationError }
