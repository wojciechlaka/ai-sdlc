'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

/** Empties the database and runs the start again (ticket import, PR clean-up, stage derivation). */
export function ResetButton() {
  const router = useRouter()
  const { clearProgress } = useAppState()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)

  const handleReset = () => {
    if (!window.confirm('Datenbank leeren, Tickets neu einlesen und offene PRs der App schließen?')) return
    startTransition(async () => {
      setError(null)
      const result = await resetSystemAction()
      if (!result.ok) {
        setError(result.error)
        return
      }
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
        title="Datenbank leeren und Tickets aus examples/tickets neu einlesen"
      >
        {pending ? 'Setze zurück...' : 'Reset'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
