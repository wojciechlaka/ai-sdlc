import { errorCode } from '@refinement/core'

/** Outcome of a Server Action: the data, or a German error message the UI shows. */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Runs a use case inside a Server Action. Domain errors (not found, conflict, validation)
 * become `{ ok: false }` so the UI can show them; anything else is rethrown for `error.tsx`.
 */
export async function runAction<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (errorCode(err)) return { ok: false, error: (err as Error).message }
    throw err
  }
}
