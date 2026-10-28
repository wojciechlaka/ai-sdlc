'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetailDto } from '@refinement/shared'
import { startStageAction, stopRunAction } from '@/app/actions'
import type { ActionResult } from '@/lib/actionResult'
import { DEFAULT_MODEL } from '@/lib/constants'
import { useSSE } from '@/hooks/useSSE'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useAppState } from './AppStateProvider'
import { AgentRunningCard } from './AgentRunningCard'
import { ModelSelect } from './ModelSelect'
import { QuestionPanel } from './QuestionPanel'
import { Button, buttonVariants } from './ui/button'

interface Props {
  ticket: TicketDetailDto
  tokenConfigured: boolean
}

/**
 * Exactly one action per state: start, stop, answer or open the PR.
 * Progress events feed the live log; state and question events refresh the server-rendered page,
 * which delivers the new state as props.
 */
export function TicketActions({ ticket, tokenConfigured }: Props) {
  const router = useRouter()
  const { progressLogs, appendProgress } = useAppState()
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const { connected, everConnected } = useSSE(ticket.key, {
    onMessage: (event) => {
      if (event.type === 'progress') appendProgress(ticket.key, event.message)
      else router.refresh()
    },
    onReconnect: () => router.refresh(),
  })

  const running = ticket.state === 'running'
  const startable = ticket.state === 'ready' || ticket.state === 'failed'
  const elapsed = useElapsedSeconds(running, !running)

  const run = (action: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (!result.ok) setError(result.error)
    })

  return (
    <section className="space-y-3">
      {ticket.stage === 'done' && <p className="text-sm text-emerald-700">Alle Stufen abgeschlossen.</p>}

      {ticket.stage === 'plan' && startable && (
        <div className="space-y-2">
          {ticket.state === 'failed' && <p className="text-sm text-red-600">Letzter Versuch fehlgeschlagen — Details im Log.</p>}
          <div className="flex items-center gap-2">
            <ModelSelect value={model} onChange={setModel} disabled={pending} size="sm" />
            <Button disabled={!tokenConfigured || pending} onClick={() => run(() => startStageAction(ticket.key, { model }))}>
              Plan starten
            </Button>
          </div>
          {!tokenConfigured && (
            <p className="text-xs text-amber-700">
              GITHUB_TOKEN fehlt — ohne Token kann die App keinen Branch und PR anlegen (siehe README).
            </p>
          )}
        </div>
      )}

      {ticket.stage === 'design' && startable && (
        <div className="space-y-1">
          <Button disabled>Design starten</Button>
          <p className="text-xs text-slate-500">Der Design-Agent (Stufe 2) folgt im nächsten Schritt.</p>
        </div>
      )}

      {running && (
        <>
          <AgentRunningCard
            elapsed={elapsed}
            progressLog={progressLogs[ticket.key] ?? []}
            connected={connected}
            everConnected={everConnected}
          />
          <Button variant="outline" disabled={pending} onClick={() => run(() => stopRunAction(ticket.key))}>
            Stoppen
          </Button>
        </>
      )}

      {ticket.state === 'awaiting_answer' && ticket.pendingQuestion && (
        <QuestionPanel ticketKey={ticket.key} question={ticket.pendingQuestion} onAnswered={() => router.refresh()} />
      )}

      {ticket.state === 'in_review' && ticket.openPr && (
        <div className="space-y-1">
          <a href={ticket.openPr.url} target="_blank" rel="noreferrer" className={buttonVariants()}>
            PR #{ticket.openPr.number} öffnen
          </a>
          <p className="text-xs text-slate-500">
            Merge auf GitHub = Freigabe dieser Stufe. Die App prüft den PR jede Minute und beim Öffnen dieser Seite.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}
