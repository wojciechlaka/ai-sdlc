import type { Stage } from '@refinement/shared'
import type { ModelId } from '@/lib/models'
import { ModelSelect } from './ModelSelect'
import { Button } from './ui/button'

const TOKEN_HINT_ID = 'token-hint'
const DESIGN_HINT_ID = 'design-hint'

/** Label of the start button per startable stage. */
const START_LABEL = { plan: 'Plan starten', design: 'Design starten' } as const

interface Props {
  stage: Stage
  /** The last attempt failed: the start doubles as a restart. */
  failed: boolean
  /** False without `GITHUB_TOKEN`: the start is disabled and a hint says why. */
  tokenConfigured: boolean
  model: ModelId
  onModelChange: (model: ModelId) => void
  /** An action is running; the controls wait for it. */
  pending: boolean
  onStart: () => void
}

/**
 * Action area of a ticket that is not running: model select and start of the current stage (with failure, token
 * and — for the design stage — a hint on what the agent does), a done message after the last stage.
 * No `'use client'`: it takes function props, so it is rendered only inside TicketActions.
 */
export function StartStagePanel({ stage, failed, tokenConfigured, model, onModelChange, pending, onStart }: Props) {
  if (stage === 'done') {
    return <p className="text-sm text-emerald-700">Alle Stufen abgeschlossen.</p>
  }

  const describedBy = [tokenConfigured ? null : TOKEN_HINT_ID, stage === 'design' ? DESIGN_HINT_ID : null].filter(Boolean).join(' ')
  return (
    <div className="space-y-2">
      {failed && <p className="text-sm text-red-600">Letzter Versuch fehlgeschlagen — Details im Log.</p>}
      <div className="flex items-center gap-2">
        <ModelSelect value={model} onChange={onModelChange} disabled={pending} size="sm" />
        <Button disabled={!tokenConfigured || pending} aria-describedby={describedBy || undefined} onClick={onStart}>
          {START_LABEL[stage]}
        </Button>
      </div>
      {stage === 'design' && (
        <p id={DESIGN_HINT_ID} className="text-xs text-slate-600">
          Der Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.
        </p>
      )}
      {!tokenConfigured && (
        <p id={TOKEN_HINT_ID} className="text-xs text-amber-700">
          GITHUB_TOKEN fehlt — ohne Token kann die App keinen Branch und PR anlegen (siehe README).
        </p>
      )}
    </div>
  )
}
