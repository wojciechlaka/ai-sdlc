import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { type Ticket, fetchTicket, startRefinement, stopRefinement, deleteTicket, STATUS_VARIANT, DEFAULT_MODEL } from '../api/ticketApi'
import { useSSE } from '../hooks/useSSE'
import { QuestionPanel } from './QuestionPanel'
import { AgentRunningCard } from './AgentRunningCard'
import { TicketMetaRow } from './TicketMetaRow'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'

const POLLING_INTERVAL_MS = 5 * 60 * 1000
const MS_PER_SECOND = 1000

type RefinementResult = Extract<NonNullable<NonNullable<Ticket['latestRun']>['output']>, { type: 'refinement' }>['result']

function PlanSection({ output }: { output: RefinementResult }) {
  const [open, setOpen] = useState(false)
  const plan = [
    output.userStory ? `## User Story\n${output.userStory}` : '',
    output.acceptanceCriteria?.length
      ? `## Akzeptanzkriterien\n${output.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}`
      : '',
    output.affectedFiles?.length
      ? `## Betroffene Dateien\n${output.affectedFiles.map(f => `- **${f.path}**: ${f.description}`).join('\n')}`
      : '',
    output.risks?.length
      ? `## Risiken\n${output.risks.map(r => `- [${r.severity}] ${r.description}`).join('\n')}`
      : '',
    output.openQuestions?.filter(q => q.blocksImplementation).length
      ? `## Offene Fragen (blockierend)\n${output.openQuestions.filter(q => q.blocksImplementation).map(q => `- ${q.question}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center justify-between">
          Agent-Run
          <span className="text-slate-400 text-xs font-normal">{open ? '▲ einklappen' : '▼ ausklappen'}</span>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="prose-plan">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

interface Props {
  ticketId: string
  repo: string
  progressLog: string[]
  onProgress: (ticketId: string, msg: string) => void
  onUpdated: (ticket: Ticket) => void
  onDeleted: (ticketId: string) => void
}

function useElapsedSeconds(isRunning: boolean, shouldReset: boolean) {
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const pausedRef = useRef(0)

  useEffect(() => {
    if (shouldReset) {
      pausedRef.current = 0
      startTimeRef.current = null
      return
    }
    if (!isRunning) {
      if (startTimeRef.current !== null) {
        pausedRef.current += Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND)
        startTimeRef.current = null
      }
      return
    }
    const offset = pausedRef.current
    startTimeRef.current = Date.now()
    const resetId = setTimeout(() => setElapsed(offset), 0)
    const id = setInterval(() => {
      if (startTimeRef.current === null) return
      setElapsed(offset + Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND))
    }, MS_PER_SECOND)
    return () => {
      clearTimeout(resetId)
      clearInterval(id)
    }
  }, [isRunning, shouldReset])

  return shouldReset ? 0 : elapsed
}

export function TicketDetail({ ticketId, repo, progressLog, onProgress, onUpdated, onDeleted }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const { lastMessage, connected, everConnected } = useSSE(ticketId)

  const isAgentRunning = ticket?.status === 'refining'
  const timerIsActive = isAgentRunning && !currentQuestion
  const timerShouldReset = !isAgentRunning
  const elapsed = useElapsedSeconds(timerIsActive, timerShouldReset)

  const onUpdatedRef = useRef(onUpdated)
  useEffect(() => { onUpdatedRef.current = onUpdated })

  const onProgressRef = useRef(onProgress)
  useEffect(() => { onProgressRef.current = onProgress })

  const reload = useCallback(async () => {
    const t = await fetchTicket(ticketId)
    setTicket(t)
    onUpdatedRef.current(t)
  }, [ticketId])

  const reloadRef = useRef(reload)
  useEffect(() => { reloadRef.current = reload })

  useEffect(() => {
    let cancelled = false
    fetchTicket(ticketId).then(t => {
      if (!cancelled) { setTicket(t); onUpdatedRef.current(t) }
    })
    return () => { cancelled = true }
  }, [ticketId])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'progress') onProgressRef.current(ticketId, lastMessage.message)
    if (lastMessage.type === 'question') {
      const q = lastMessage.question
      setTimeout(() => setCurrentQuestion(q), 0)
    }
    if (lastMessage.type === 'status') {
      setTimeout(() => setCurrentQuestion(null), 0)
      reloadRef.current()
    }
  }, [lastMessage, ticketId])

  // Restore question state from persisted latestRun on page load / refresh
  useEffect(() => {
    if (!ticket) return
    const run = ticket.latestRun
    if (run?.status === 'succeeded' && run.output?.type === 'question') {
      const question = run.output.question
      setTimeout(() => setCurrentQuestion(question), 0)
    } else if (ticket.status !== 'refining') {
      setTimeout(() => setCurrentQuestion(null), 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.latestRun?.id, ticket?.status])

  useEffect(() => {
    if (!isAgentRunning) return
    const interval = setInterval(() => reloadRef.current(), POLLING_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isAgentRunning])

  if (!ticket) return <p className="p-6 text-slate-400">Lädt...</p>

  const canRefine = ticket.status === 'backlog' || ticket.status === 'review'

  const handleRefine = async () => {
    await startRefinement(ticketId, { repo, model, acceptanceCriteria: '' })
    await reload()
  }

  const handleStop = async () => {
    await stopRefinement(ticketId)
    await reload()
  }

  const handleDelete = async () => {
    await deleteTicket(ticketId)
    onDeleted(ticketId)
  }

  const latestRun = ticket.latestRun
  const refinementOutput = latestRun?.output?.type === 'refinement' ? latestRun.output.result : null

  const durationSeconds = latestRun?.startedAt && latestRun?.finishedAt
    ? Math.round((new Date(latestRun.finishedAt).getTime() - new Date(latestRun.startedAt).getTime()) / MS_PER_SECOND)
    : undefined

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{ticket.title}</h2>
        <Badge variant={STATUS_VARIANT[ticket.status]} className="shrink-0">{ticket.status}</Badge>
      </div>

      <TicketMetaRow
        model={model}
        canRefine={canRefine}
        onModelChange={setModel}
        durationSeconds={durationSeconds}
        latestRun={latestRun ?? undefined}
        refinementOutput={refinementOutput}
      />

      <Separator />

      <section>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Beschreibung</h3>
        <p className="text-sm text-slate-700">{ticket.description}</p>
      </section>

      <div className="flex gap-2">
        <Button disabled={!canRefine || !repo} onClick={handleRefine} title={!repo ? 'Repository-URL eingeben' : undefined}>
          Refine
        </Button>
        {isAgentRunning && (
          <Button variant="outline" onClick={handleStop}>Stoppen</Button>
        )}
        <Button variant="outline" disabled={isAgentRunning} onClick={handleDelete}>
          Löschen
        </Button>
      </div>

      {isAgentRunning && (
        <AgentRunningCard
          elapsed={elapsed}
          progressLog={progressLog}
          connected={connected}
          everConnected={everConnected}
        />
      )}

      {isAgentRunning && currentQuestion && (
        <QuestionPanel
          ticketId={ticketId}
          question={currentQuestion}
          onAnswered={() => setCurrentQuestion(null)}
        />
      )}

      {refinementOutput && <PlanSection output={refinementOutput} />}
    </div>
  )
}
