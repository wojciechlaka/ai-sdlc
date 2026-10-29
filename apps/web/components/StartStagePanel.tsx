import type { Stage } from '@refinement/shared'
import type { ModelId } from '@/lib/models'
import { ModelSelect } from './ModelSelect'
import { Button } from './ui/button'

const TOKEN_HINT_ID = 'token-hint'
const DESIGN_HINT_ID = 'design-hint'

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
 * Action area of a ticket that is not running: model select and start for the plan stage (with failure and
 * token hints), a disabled start for the design stage, a done message after the last stage.
 * No `'use client'`: it takes function props, so it is rendered only inside TicketActions.
 */
export function StartStagePanel({ stage, failed, tokenConfigured, model, onModelChange, pending, onStart }: Props) {
  if (stage === 'done') {
    return <p className="text-sm text-emerald-700">Alle Stufen abgeschlossen.</p>
  }

  if (stage === 'design') {
    return (
      <div className="space-y-2">
        <Button disabled aria-describedby={DESIGN_HINT_ID}>
          Design starten
        </Button>
        <div id={DESIGN_HINT_ID} role="note" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">Stufe 1 ist abgeschlossen — der Intent ist gemergt.</p>
          <p className="mt-1 text-slate-600">
            Stufe 2 (Design) ist noch nicht gebaut. Hier startet später der Design-Agent, der aus dem Intent die Spec
            (<code>spec.md</code>) schreibt; dann gibt es auch die Modellauswahl. Den Intent siehst du unten unter „Stufen“.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {failed && <p className="text-sm text-red-600">Letzter Versuch fehlgeschlagen — Details im Log.</p>}
      <div className="flex items-center gap-2">
        <ModelSelect value={model} onChange={onModelChange} disabled={pending} size="sm" />
        <Button disabled={!tokenConfigured || pending} aria-describedby={tokenConfigured ? undefined : TOKEN_HINT_ID} onClick={onStart}>
          Plan starten
        </Button>
      </div>
      {!tokenConfigured && (
        <p id={TOKEN_HINT_ID} className="text-xs text-amber-700">
          GITHUB_TOKEN fehlt — ohne Token kann die App keinen Branch und PR anlegen (siehe README).
        </p>
      )}
    </div>
  )
}
