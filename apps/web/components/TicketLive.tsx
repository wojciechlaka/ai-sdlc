'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetailDto } from '@refinement/shared'
import { deleteTicketAction, startRefinementAction, stopRefinementAction } from '@/app/actions'
import type { ActionResult } from '@/lib/actionResult'
import { DEFAULT_MODEL } from '@/lib/constants'
import { useSSE } from '@/hooks/useSSE'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useAppState } from './AppStateProvider'
import { AgentRunningCard } from './AgentRunningCard'
import { QuestionPanel } from './QuestionPanel'
import { TicketMetaRow } from './TicketMetaRow'
import { Button } from './ui/button'

const MS_PER_SECOND = 1000

interface Props {
  ticket: TicketDetailDto
  /** Server-rendered static content shown between the meta row and the action buttons. */
  children: ReactNode
}

/**
 * Interactive part of the ticket page. Live events update the progress log directly;
 * status and question events refresh the server-rendered page (`router.refresh()`), which
 * delivers the new ticket state as props.
 */
export function TicketLive({ ticket, children }: Props) {
  const router = useRouter()
  const { repoUrl, progressLogs, appendProgress } = useAppState()
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [answeredRunId, setAnsweredRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const { connected, everConnected } = useSSE(ticket.id, {
    onMessage: (event) => {
      if (event.type === 'progress') appendProgress(ticket.id, event.message)
      else router.refresh()
    },
    onReconnect: () => router.refresh(),
  })

  const latestRun = ticket.latestRun
  const isAgentRunning = ticket.status === 'refining'
  const canRefine = ticket.status === 'backlog' || ticket.status === 'review'
  const repo = repoUrl ?? ''

  // The answer run is created in the background; until the page refreshes, the question run
  // is still the latest — hide its question as soon as it was answered.
  const pendingQuestion =
    isAgentRunning && latestRun?.status === 'succeeded' && latestRun.output?.type === 'question'
      && latestRun.id !== answeredRunId
      ? latestRun.output.question
      : null

  const elapsed = useElapsedSeconds(isAgentRunning && !pendingQuestion, !isAgentRunning)
  const refinementOutput = latestRun?.output?.type === 'refinement' ? latestRun.output.result : null
  const durationSeconds = latestRun?.finishedAt
    ? Math.round((latestRun.finishedAt.getTime() - latestRun.startedAt.getTime()) / MS_PER_SECOND)
    : undefined

  const run = (action: () => Promise<ActionResult<unknown>>, onSuccess?: () => void) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (!result.ok) {
        setError(result.error)
        return
      }
      onSuccess?.()
    })

  return (
    <>
      <TicketMetaRow
        model={model}
        canRefine={canRefine}
        onModelChange={setModel}
        durationSeconds={durationSeconds}
        latestRun={latestRun ?? undefined}
        refinementOutput={refinementOutput}
      />

      {children}

      <div className="flex gap-2">
        <Button
          disabled={!canRefine || !repo || pending}
          onClick={() => run(() => startRefinementAction(ticket.id, { repo, model, acceptanceCriteria: '' }))}
          title={!repo ? 'Repository-URL eingeben' : undefined}
        >
          Refine
        </Button>
        {isAgentRunning && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => stopRefinementAction(ticket.id))}>
            Stoppen
          </Button>
        )}
        <Button
          variant="outline"
          disabled={isAgentRunning || pending}
          onClick={() => run(() => deleteTicketAction(ticket.id), () => router.push('/'))}
        >
          Löschen
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {isAgentRunning && (
        <AgentRunningCard
          elapsed={elapsed}
          progressLog={progressLogs[ticket.id] ?? []}
          connected={connected}
          everConnected={everConnected}
        />
      )}

      {pendingQuestion && latestRun && (
        <QuestionPanel ticketId={ticket.id} question={pendingQuestion} onAnswered={() => setAnsweredRunId(latestRun.id)} />
      )}
    </>
  )
}
