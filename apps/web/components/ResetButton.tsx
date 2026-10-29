'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useServerAction } from '@/hooks/useServerAction'
import { useAppState } from './AppStateProvider'

/** What the reset does; shown as tooltip and, as a question, in the confirmation dialog. */
function resetEffect(baseBranch: string, baselineTag: string): string {
  return 'Datenbank leeren, Tickets neu einlesen, offene PRs der App schließen und den Branch '
    + `${baseBranch} auf ${baselineTag} zurücksetzen`
}

/**
 * Empties the database and runs the start again with a repo reset (ticket import, PR clean-up,
 * base branch back to the baseline tag, stage derivation). Warnings of the start stay visible.
 * Branch and tag come from the settings, so the texts name what the reset really touches.
 */
export function ResetButton({ baseBranch, baselineTag }: { baseBranch: string; baselineTag: string }) {
  const effect = resetEffect(baseBranch, baselineTag)
  const router = useRouter()
  const { clearProgress } = useAppState()
  const { run, pending, error } = useServerAction()
  const [warnings, setWarnings] = useState<string[]>([])

  const handleReset = () => {
    if (!window.confirm(`${effect}?`)) return
    setWarnings([])
    run(resetSystemAction, (data) => {
      setWarnings(data.warnings)
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
        title={effect}
      >
        {pending ? 'Setze zurück…' : 'Reset'}
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
