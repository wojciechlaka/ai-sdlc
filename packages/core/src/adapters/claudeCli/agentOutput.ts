import type { ZodType } from 'zod'
import type { StageOutput } from '@refinement/shared'
import { SchemaValidationError } from './errors'

// The agent's answer text → validated stage output.

const MARKDOWN_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/

/** Strips a Markdown fence if present, otherwise takes the outermost `{...}`. */
export function extractJsonString(raw: string): string {
  const s = raw.trim()
  const fenceMatch = s.match(MARKDOWN_CODE_BLOCK_RE)
  if (fenceMatch) return fenceMatch[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) return s.slice(start, end + 1)
  return s
}

/** Parses the agent text and validates it against the stage schema. @throws SchemaValidationError */
export function parseAndValidate(raw: string, schema: ZodType<StageOutput>): StageOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonString(raw))
  } catch {
    throw new SchemaValidationError('invalid_json', [], raw)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new SchemaValidationError('schema_mismatch', result.error.issues, raw)
  return result.data
}
