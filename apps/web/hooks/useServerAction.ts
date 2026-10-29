'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/actionResult'

/** What `useServerAction` returns. */
export interface ServerAction {
  /** Runs `action` in a transition; calls `onSuccess` with its data, otherwise keeps its error. */
  run: <T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) => void
  /** True while an action runs; buttons use it to disable themselves. */
  pending: boolean
  /** German error of the last failed action, cleared when the next one starts. */
  error: string | null
}

/** Pending flag and error state around Server Actions that return an `ActionResult`. */
export function useServerAction(): ServerAction {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run: ServerAction['run'] = (action, onSuccess) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (result.ok) onSuccess?.(result.data)
      else setError(result.error)
    })

  return { run, pending, error }
}
