import type { ZodIssue } from 'zod'

/** Why the agent output was rejected: no parseable JSON at all, or JSON that violates the stage schema. */
export type SchemaFailureReason = 'invalid_json' | 'schema_mismatch'

/** Thrown when Claude's output cannot be parsed or does not satisfy the stage's output schema. German: it can end a run in the UI. */
export class SchemaValidationError extends Error {
  constructor(
    public readonly reason: SchemaFailureReason,
    /** Zod issues for `schema_mismatch`; empty for `invalid_json`. */
    public readonly issues: ZodIssue[],
    public readonly rawOutput?: string,
  ) {
    super(reason === 'invalid_json'
      ? 'Agent-Ausgabe ist kein gültiges JSON'
      : `Agent-Ausgabe verletzt das Schema: ${issues.map(i => i.message).join(', ')}`)
    this.name = 'SchemaValidationError'
  }
}

/** Also defined in adapters/git/repoCache.ts — adapters cannot share code (architecture test). */
const STDERR_PREVIEW_CHARS = 200

/** Thrown when the Claude CLI process exits with a non-zero, non-SIGTERM exit code. German: it can end a run in the UI. */
export class CliError extends Error {
  constructor(public readonly exitCode: number, stderr: string) {
    super(`claude endete mit Exit-Code ${exitCode}: ${stderr.slice(0, STDERR_PREVIEW_CHARS)}`)
    this.name = 'CliError'
  }
}
