import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from '../domain/errors'
import { finishRun, isCurrentRun, type RunRequest } from './runLifecycle'
import { executeRun } from './executeRun'
import { failStage } from './failStage'

/**
 * Background job of `startStage` and `answerQuestion`: update the clone → codebase summary → agent run.
 * Never throws. Stops early when the ticket was stopped while the clone was prepared.
 */
export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: RunRequest & { runId: string }): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const { runId } = request
  reporter.log(`Starting stage ${request.stage} (${request.trigger}) for "${ticket.title}"`)

  reporter.progress('Repository wird vorbereitet…')
  let repoDir: string
  try {
    repoDir = await deps.repos.ensureRepo(deps.repoUrl)
  } catch (err) {
    const current = isCurrentRun(deps, ticket.key, runId)
    finishRun(deps, ticket.key, runId, 'failed')
    if (current) failStage(deps, reporter, ticket.key, `Repository konnte nicht geladen werden. (${describeError(err)})`)
    return
  }

  if (!stillCurrentOrFinish(deps, ticket.key, runId)) return

  const codebaseSummary = await deps.repos.ensureSummary(repoDir, request.model, reporter.logAndProgress)
  if (!codebaseSummary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  if (!stillCurrentOrFinish(deps, ticket.key, runId)) return

  reporter.progress('Agent wird gestartet…')
  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary })
}

/**
 * Checkpoint between two background steps: true while the attempt is current; otherwise ends its run as failed
 * (the stop, restart or reset that made it stale already set the ticket state).
 */
function stillCurrentOrFinish(deps: UseCaseDeps, ticketKey: string, runId: string): boolean {
  if (isCurrentRun(deps, ticketKey, runId)) return true
  finishRun(deps, ticketKey, runId, 'failed')
  return false
}
