import type { z } from 'zod'
import { ValidationError } from '../domain/errors'

/**
 * Validates untrusted input from a driving adapter.
 * @throws {ValidationError} with all issue messages joined.
 */
export function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join(', '))
  }
  return result.data
}
