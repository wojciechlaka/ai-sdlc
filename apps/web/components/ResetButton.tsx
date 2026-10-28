'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

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
      className="btn-ghost-xs shrink-0"
      title="Auf CC-Seed-Tickets zurücksetzen"
    >
      Reset
    </button>
  )
}
