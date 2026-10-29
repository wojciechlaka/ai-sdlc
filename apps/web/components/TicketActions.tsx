'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetailDto } from '@refinement/shared'
import { startStageAction, stopRunAction } from '@/app/actions'
import { DEFAULT_MODEL } from '@/lib/models'
import { useSSE } from '@/hooks/useSSE'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useServerAction } from '@/hooks/useServerAction'
import { useAppState } from './AppStateProvider'
import { AgentRunningCard } from './AgentRunningCard'
import { QuestionPanel } from './QuestionPanel'
import { StartStagePanel } from './StartStagePanel'
import { Button, buttonVariants } from './ui/button'

interface Props {
  ticket: TicketDetailDto
  /** False without `GITHUB_TOKEN`: the start action is disabled with a hint. */
  tokenConfigured: boolean
}

/**
 * The action area of the ticket page, one per state: start (ready, failed), progress and stop (running),
 * question and cancel (awaiting_answer), PR link (in_review); plus the error of the last action.
 * A client component: it holds the model choice and pending/error state and listens to the ticket's SSE stream.
 * Progress events feed the live log; state and question events refresh the server-rendered page,
 * which delivers the new state as props.
 */
export function TicketActions({ ticket, tokenConfigured }: Props) {
  const router = useRouter()
  const { progressLogs, appendProgress, clearProgress } = useAppState()
  const [model, setModel] = useState(DEFAULT_MODEL)
  const { run, pending, error } = useServerAction()

  const { connected, everConnected } = useSSE(ticket.key, {
    onMessage: (event) => {
      if (event.type === 'progress') appendProgress(ticket.key, event.message)
      else router.refresh()
    },
    onReconnect: () => router.refresh(),
  })
  const elapsed = useElapsedSeconds(ticket.state === 'running')

  const stopButton = (label: string) => (
    <StopButton label={label} pending={pending} onStop={() => run(() => stopRunAction(ticket.key))} />
  )

  const actionArea = (): ReactNode => {
    switch (ticket.state) {
      case 'ready':
      case 'failed':
        return (
          <StartStagePanel
            stage={ticket.stage}
            failed={ticket.state === 'failed'}
            tokenConfigured={tokenConfigured}
            model={model}
            onModelChange={setModel}
            pending={pending}
            onStart={() => run(() => startStageAction(ticket.key, { model }), () => clearProgress(ticket.key))}
          />
        )
      case 'running':
        return (
          <>
            <AgentRunningCard
              elapsed={elapsed}
              progressLog={progressLogs[ticket.key] ?? []}
              connected={connected}
              everConnected={everConnected}
            />
            {stopButton('Stoppen')}
          </>
        )
      case 'awaiting_answer':
        return (
          <>
            {ticket.pendingQuestion && (
              <QuestionPanel ticketKey={ticket.key} question={ticket.pendingQuestion} onAnswered={() => router.refresh()} />
            )}
            {stopButton('Abbrechen')}
            {!ticket.pendingQuestion && <SyncingNotice />}
          </>
        )
      case 'in_review':
        return ticket.openPr ? <ReviewLink pr={ticket.openPr} /> : <SyncingNotice />
    }
  }

  return (
    <section className="space-y-3">
      {actionArea()}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}

/** Ends the current attempt; labelled "Stoppen" while running and "Abbrechen" while waiting for an answer. */
function StopButton({ label, pending, onStop }: { label: string; pending: boolean; onStop: () => void }) {
  return (
    <Button variant="outline" disabled={pending} onClick={onStop}>
      {label}
    </Button>
  )
}

/** Link to the open PR; merging it is the gate to the next stage. */
function ReviewLink({ pr }: { pr: NonNullable<TicketDetailDto['openPr']> }) {
  return (
    <div className="space-y-1">
      <a href={pr.url} target="_blank" rel="noreferrer" className={buttonVariants()}>
        PR #{pr.number} öffnen
      </a>
      <p className="text-xs text-slate-500">
        Merge auf GitHub = Freigabe dieser Stufe. Die App prüft den PR jede Minute und beim Öffnen dieser Seite.
      </p>
    </div>
  )
}

/**
 * Shown while the state promises something the page does not have yet: awaiting_answer without a question,
 * in_review without an open PR. The next state event or review sync refreshes the page.
 */
function SyncingNotice() {
  return <p className="text-sm text-slate-500">Zustand wird abgeglichen …</p>
}
