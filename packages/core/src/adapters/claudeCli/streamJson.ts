import { CliError } from './errors'
import type { ClaudeStreamMessage, ClaudeTokenUsage, ExtractedResult } from './types'

// Reading the `--output-format stream-json` output of `claude`: progress while it streams, the result at the end.

/** Tools whose use means the agent is exploring the codebase; each switch to one of them shows ANALYSIS_PROGRESS. */
const CODEBASE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'Bash'])
const ANALYSIS_PROGRESS = 'Codebase wird analysiert…'

/**
 * Parses one stream-JSON line and emits a progress message if a new tool_use block is detected.
 * Returns the (possibly updated) last progress message to avoid emitting duplicates.
 */
export function handleLine(line: string, lastProgressMsg: string, onProgress: (msg: string) => void): string {
  const trimmed = line.trim()
  if (!trimmed) return lastProgressMsg
  try {
    const ev = JSON.parse(trimmed) as Record<string, unknown>
    if (ev.type !== 'assistant') return lastProgressMsg
    const content = (ev.message as ClaudeStreamMessage)?.content ?? []
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      if (!CODEBASE_TOOLS.has(block.name as string) || lastProgressMsg === ANALYSIS_PROGRESS) continue
      lastProgressMsg = ANALYSIS_PROGRESS
      onProgress(ANALYSIS_PROGRESS)
    }
  } catch { /* incomplete line */ }
  return lastProgressMsg
}

/** Finds the `result`/`success` line of the stream-JSON output. @throws CliError if there is none. */
export function extractResult(raw: string): ExtractedResult {
  for (const line of raw.split('\n')) {
    try {
      const obj = JSON.parse(line.trim()) as Record<string, unknown>
      if (obj.type === 'result' && obj.subtype === 'success') {
        const usage = obj.usage as ClaudeTokenUsage | undefined
        return {
          text: (obj.result as string) ?? '',
          inputTokens: usage?.input_tokens ?? 0,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          costUsd: reportedCost(obj),
        } satisfies ExtractedResult
      }
    } catch { /* skip */ }
  }
  throw new CliError(-1, 'Kein Erfolgsergebnis in der stream-json-Ausgabe')
}

/** `total_cost_usd` of newer CLI versions, `cost_usd` of older ones, otherwise 0. */
function reportedCost(result: Record<string, unknown>): number {
  if (typeof result.total_cost_usd === 'number') return result.total_cost_usd
  return typeof result.cost_usd === 'number' ? result.cost_usd : 0
}
