'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

/**
 * Empties the database and runs the start again with a repo reset (ticket import, PR clean-up,
 * branch `showcase` back to tag `showcase-base`, stage derivation). Warnings of the start stay visible.
 */
export function ResetButton() {
  const router = useRouter()
  const { clearProgress } = useAppState()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const handleReset = () => {
    if (!window.confirm('Datenbank leeren, Tickets neu einlesen, offene PRs der App schließen und den Branch showcase auf showcase-base zurücksetzen?')) return
    startTransition(async () => {
      setError(null)
      setWarnings([])
      const result = await resetSystemAction()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setWarnings(result.data.warnings)
      clearProgress()
      router.push('/')
    })
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleReset}
        disabled={pending}
        className="btn-ghost-xs"
        title="Datenbank leeren, Tickets aus examples/tickets neu einlesen und Branch showcase zurücksetzen"
      >
        {pending ? 'Setze zurück...' : 'Reset'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <ul role="status" className="space-y-1 text-xs text-amber-700">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
