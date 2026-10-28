import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { finishRun, isCurrentRun, type RunRequest } from './beginRun'
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

  reporter.progress('Repository wird vorbereitet...')
  let repoDir: string
  try {
    repoDir = await deps.repos.ensureRepo(deps.repoUrl)
  } catch (err) {
    const current = isCurrentRun(deps, ticket.key, runId)
    finishRun(deps, ticket.key, runId, 'failed')
    if (current) failStage(deps, reporter, ticket.key, `Repository konnte nicht geladen werden. (${describeError(err)})`)
    return
  }

  if (!isCurrentRun(deps, ticket.key, runId)) {
    finishRun(deps, ticket.key, runId, 'failed')
    return
  }

  const codebaseSummary = await deps.repos.ensureSummary(repoDir, request.model, reporter.report)
  if (!codebaseSummary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  if (!isCurrentRun(deps, ticket.key, runId)) {
    finishRun(deps, ticket.key, runId, 'failed')
    return
  }

  reporter.progress('Agent wird gestartet...')
  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary })
}
