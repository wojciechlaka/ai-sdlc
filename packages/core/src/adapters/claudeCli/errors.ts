import type { ZodIssue } from 'zod'

/** Thrown when Claude's output cannot be parsed or does not satisfy the RefinementOutput schema. */
export class SchemaValidationError extends Error {
  constructor(
    public readonly issues: ZodIssue[],
    public readonly rawOutput?: string,
  ) {
    super(`Agent-Ausgabe verletzt das Schema: ${issues.map(i => i.message).join(', ')}`)
    this.name = 'SchemaValidationError'
  }
}

const STDERR_PREVIEW_CHARS = 200

/** Thrown when the Claude CLI process exits with a non-zero, non-SIGTERM exit code. German: it can end a run in the UI. */
export class CliError extends Error {
  constructor(public readonly exitCode: number, stderr: string) {
    super(`claude endete mit Exit-Code ${exitCode}: ${stderr.slice(0, STDERR_PREVIEW_CHARS)}`)
    this.name = 'CliError'
  }
}
