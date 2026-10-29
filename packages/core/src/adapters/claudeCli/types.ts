import type { StageOutput } from '@refinement/shared'
import type { SchemaValidationError } from './errors'

/** `message` of an `assistant` stream-json line; only its content blocks are read. */
export interface ClaudeStreamMessage {
  content?: Array<Record<string, unknown>>
}

/** `usage` of the stream-json `result` line. */
export interface ClaudeTokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Answer text and usage of one `claude` call, taken from its stream-json `result` line. */
export interface ExtractedResult {
  text: string
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

/** Outcome of one `claude` call: validated output, or the schema error to retry with. Other errors are thrown. */
export type ClaudeCallResult =
  | { ok: true; output: StageOutput; cliResult: ExtractedResult }
  | { ok: false; cliResult: ExtractedResult; error: SchemaValidationError }
