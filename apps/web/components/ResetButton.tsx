'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

/** Empties the database and runs the start again (ticket import, PR clean-up, stage derivation). */
export function ResetButton() {
  const router = useRouter()
  const { clearProgress } = useAppState()
  const [pending, startTransition] = useTransition()

  const handleReset = () =>
    startTransition(async () => {
      await resetSystemAction()
      clearProgress()
      router.push('/')
    })

  return (
    <button
      onClick={handleReset}
      disabled={pending}
      className="btn-ghost-xs"
      title="Datenbank leeren und Tickets aus examples/tickets neu einlesen"
    >
      {pending ? 'Setze zurück...' : 'Reset'}
    </button>
  )
}
