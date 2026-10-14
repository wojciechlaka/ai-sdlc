import { ensureRepo, ensureRepoSummary } from './repoCache'
import { getTicket, updateTicketStatus, formatTicketId } from './db/tickets'
import type { TicketStatus } from './db/tickets'
import { createAgentRun, completeAgentRun, failAgentRun, getRunsForTicket } from './db/agentRuns'
import { appendAuditEvent } from './db/auditEvents'
import { refinementEvents } from './events'
import { runRefinement } from './agentCli'
import type { QAPair } from './agentCli/prompt'
import { TerminatedError, TimeoutError } from './agentCli/errors'
import type { AgentRunInput } from './db/schema'

export { stopRefinement } from './agentCli'

function log(ticketId: number, msg: string) {
  console.log(`[${new Date().toISOString()}] [${formatTicketId(ticketId)}] ${msg}`)
}

function progress(ticketId: number, message: string) {
  refinementEvents.emit('progress', { ticketId: formatTicketId(ticketId), message })
}

function report(ticketId: number, msg: string) {
  log(ticketId, msg)
  progress(ticketId, msg)
}

function setStatus(ticketId: number, status: TicketStatus) {
  updateTicketStatus(ticketId, status)
  refinementEvents.emit('status', { ticketId: formatTicketId(ticketId), status })
}

async function executeRun(
  ticketId: number,
  runInput: {
    trigger: 'initial' | 'answer' | 'rework'
    input: AgentRunInput
    model: string
    repoPath: string
    previousRuns?: QAPair[]
    codebaseSummary?: string | null
  },
) {
  const run = createAgentRun({
    ticketId,
    trigger: runInput.trigger,
    model: runInput.model,
    input: runInput.input,
  })

  appendAuditEvent({ ticketId, actor: 'system', type: 'run_started', payload: { runId: run.id } })

  try {
    const { output, meta } = await runRefinement(
      {
        ticketId: formatTicketId(ticketId),
        title: runInput.input.ticketTitle,
        description: runInput.input.ticketDescription,
        acceptanceCriteria: runInput.input.acceptanceCriteria,
        repoPath: runInput.repoPath,
        model: runInput.model,
        codebaseSummary: runInput.codebaseSummary ?? undefined,
        previousRuns: runInput.previousRuns,
      },
      (msg) => report(ticketId, msg),
    )

    log(ticketId, `Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
    completeAgentRun(run.id, {
      output,
      costUsd: meta.costUsd,
      inputTokens: meta.inputTokens,
      cacheCreationTokens: meta.cacheCreationTokens,
      cacheReadTokens: meta.cacheReadTokens,
      outputTokens: meta.outputTokens,
    })
    appendAuditEvent({ ticketId, actor: 'agent', type: 'run_finished', payload: { runId: run.id, status: 'succeeded' } })

    if (output.type === 'question') {
      progress(ticketId, 'Agent stellt eine Rückfrage...')
      refinementEvents.emit('question', { ticketId: formatTicketId(ticketId), question: output.question })
    } else {
      setStatus(ticketId, 'review')
    }
  } catch (err) {
    if (err instanceof TerminatedError) {
      log(ticketId, 'Refinement terminated by user')
      failAgentRun(run.id, 'failed')
      appendAuditEvent({ ticketId, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: 'failed' } })
      setStatus(ticketId, 'backlog')
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      log(ticketId, `ERROR: ${msg}`)
      progress(ticketId, `Fehler: ${msg}`)
      const runStatus = err instanceof TimeoutError ? 'timeout' as const : 'failed' as const
      failAgentRun(run.id, runStatus)
      appendAuditEvent({ ticketId, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: runStatus } })
      setStatus(ticketId, 'failed')
    }
  }
}

/**
 * Starts an initial refinement run for a ticket.
 * Clones/updates the repo, generates a codebase summary, then fires the agent.
 * Designed to be called fire-and-forget — all errors are handled internally.
 * @param ticketId - Numeric ticket ID.
 * @param params   - Repository URL, Claude model, and optional acceptance criteria.
 */
export async function startRefinement(
  ticketId: number,
  params: { repo: string; model: string; acceptanceCriteria: string },
): Promise<void> {
  let ticket: ReturnType<typeof getTicket>
  try {
    ticket = getTicket(ticketId)
  } catch {
    log(ticketId, 'ERROR: ticket not found — aborting refinement')
    progress(ticketId, 'Fehler: Ticket nicht gefunden.')
    return
  }

  log(ticketId, `Starting refinement for "${ticket.title}"`)

  let repoDir: string
  try {
    progress(ticketId, 'Repository wird vorbereitet...')
    repoDir = await ensureRepo(params.repo)
    progress(ticketId, 'Repository bereit.')
  } catch (err) {
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString().trim()
    const detail = stderr || (err instanceof Error ? err.message : String(err))
    log(ticketId, `Repository error: ${detail}`)
    setStatus(ticketId, 'failed')
    progress(ticketId, `Fehler: Repository konnte nicht geladen werden. (${detail})`)
    return
  }

  const summary = await ensureRepoSummary(repoDir, params.model, (msg) => report(ticketId, msg))
  if (!summary) {
    progress(ticketId, 'Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  }
  progress(ticketId, 'Agent wird gestartet...')

  await executeRun(ticketId, {
    trigger: 'initial',
    model: params.model,
    repoPath: repoDir,
    codebaseSummary: summary,
    input: {
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      acceptanceCriteria: params.acceptanceCriteria,
      repo: params.repo,
      model: params.model,
    },
  })
}

function isQuestionOutput(output: unknown): output is { type: 'question'; question: string } {
  return typeof output === 'object' && output !== null
    && (output as Record<string, unknown>).type === 'question'
    && typeof (output as Record<string, unknown>).question === 'string'
}

/**
 * Continues a refinement by submitting an answer to the agent's last question.
 * Reconstructs the full Q&A history from the run log and fires a new agent run.
 * Designed to be called fire-and-forget — all errors are handled internally.
 * @param ticketId - Numeric ticket ID.
 * @param answer   - The human's answer to the agent's last question.
 */
export async function startAnswerRun(ticketId: number, answer: string): Promise<void> {
  let ticket: ReturnType<typeof getTicket>
  try {
    ticket = getTicket(ticketId)
  } catch {
    log(ticketId, 'ERROR: ticket not found — aborting answer run')
    return
  }

  const runs = getRunsForTicket(ticketId)

  let latestQuestionRun: typeof runs[number] | undefined
  let latestAnswerRun: typeof runs[number] | undefined
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!
    if (!latestQuestionRun && isQuestionOutput(r.output)) latestQuestionRun = r
    if (!latestAnswerRun && r.trigger === 'answer') latestAnswerRun = r
    if (latestQuestionRun && latestAnswerRun) break
  }
  if (!latestQuestionRun) {
    log(ticketId, 'ERROR: no pending question found — aborting answer run')
    return
  }
  const { question } = latestQuestionRun.output as { type: 'question'; question: string }

  const existingPairs = ((latestAnswerRun?.input as AgentRunInput | undefined)?.previousRuns ?? []) as QAPair[]
  const previousRuns: QAPair[] = [...existingPairs, { question, answer }]

  const initialInput = latestQuestionRun.input as AgentRunInput

  // Ticket is already 'refining' — no status transition needed, progress event signals the start.
  progress(ticketId, 'Antwort empfangen — Agent analysiert Antwort...')
  log(ticketId, `Starting answer run for "${ticket.title}" (${previousRuns.length} Q&A pair(s))`)

  let repoDir: string
  try {
    repoDir = await ensureRepo(initialInput.repo)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(ticketId, `Repository error: ${detail}`)
    setStatus(ticketId, 'failed')
    progress(ticketId, `Fehler: Repository konnte nicht geladen werden. (${detail})`)
    return
  }

  const summary = await ensureRepoSummary(repoDir, initialInput.model, (msg) => report(ticketId, msg))
  progress(ticketId, 'Agent wird gestartet...')

  await executeRun(ticketId, {
    trigger: 'answer',
    model: initialInput.model,
    repoPath: repoDir,
    codebaseSummary: summary,
    previousRuns,
    input: {
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      acceptanceCriteria: initialInput.acceptanceCriteria,
      repo: initialInput.repo,
      model: initialInput.model,
      previousRuns,
    },
  })
}
