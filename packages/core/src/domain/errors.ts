/** Stable code of a domain error; adapters map it to a response (e.g. HTTP status) via `errorCode`. */
export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'

/** The requested ticket or run does not exist. */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** The action is not allowed in the ticket's current state. */
export class ConflictError extends Error {
  readonly code = 'CONFLICT' as const
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/** The input did not match the expected schema. */
export class ValidationError extends Error {
  readonly code = 'VALIDATION' as const
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const DOMAIN_CODES: readonly DomainErrorCode[] = ['NOT_FOUND', 'CONFLICT', 'VALIDATION']

/**
 * Returns the domain error code, or null for any other error.
 * Checks the `code` field instead of `instanceof` because bundlers (Next.js) may load
 * this module more than once, which breaks class identity.
 * @param err - Any thrown value.
 */
export function errorCode(err: unknown): DomainErrorCode | null {
  if (typeof err !== 'object' || err === null) return null
  const code = (err as { code?: unknown }).code
  return DOMAIN_CODES.includes(code as DomainErrorCode) ? (code as DomainErrorCode) : null
}

/**
 * User-facing text of any thrown value; prefers a process's stderr (git) where present.
 * Credentials in URLs are redacted, so the text is safe for logs, warnings and the ticket page.
 */
export function describeError(err: unknown): string {
  const stderr = (err as { stderr?: { toString(): string } } | null)?.stderr?.toString().trim()
  const text = stderr || (err instanceof Error ? err.message : String(err))
  return text.replace(/https:\/\/[^@\s/]*@/g, 'https://***@')
}
