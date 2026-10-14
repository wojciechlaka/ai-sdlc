import type { ZodIssue } from 'zod'

/** Thrown when the Claude CLI does not produce output within the configured timeout. */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude did not respond within ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

/** Thrown when the user explicitly stops a running refinement (SIGTERM sent to Claude). */
export class TerminatedError extends Error {
  constructor() {
    super('Refinement was terminated by user')
    this.name = 'TerminatedError'
  }
}

/** Thrown when Claude's output cannot be parsed or does not satisfy the RefinementOutput schema. */
export class SchemaValidationError extends Error {
  constructor(
    public readonly issues: ZodIssue[],
    public readonly rawOutput?: string,
  ) {
    super(`Agent output failed schema validation: ${issues.map(i => i.message).join(', ')}`)
    this.name = 'SchemaValidationError'
  }
}

const STDERR_PREVIEW_CHARS = 200

/** Thrown when the Claude CLI process exits with a non-zero, non-SIGTERM exit code. */
export class CliError extends Error {
  constructor(public readonly exitCode: number, stderr: string) {
    super(`claude exited with code ${exitCode}: ${stderr.slice(0, STDERR_PREVIEW_CHARS)}`)
    this.name = 'CliError'
  }
}
