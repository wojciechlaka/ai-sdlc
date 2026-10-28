import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { executeRun, type StageRunRequest } from './executeRun'
import { failStage } from './failStage'

/**
 * Background job of `startStage` and `answerQuestion`: update the clone → codebase summary → agent run.
 * Never throws. Stops early when the ticket was stopped while the clone was prepared.
 */
export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: StageRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const stillRunning = () => deps.tickets.findByKey(ticket.key)?.state === 'running'
  reporter.log(`Starting stage ${request.stage} (${request.trigger}) for "${ticket.title}"`)

  reporter.progress('Repository wird vorbereitet...')
  let repoDir: string
  try {
    repoDir = await deps.repos.ensureRepo(deps.repoUrl)
  } catch (err) {
    if (stillRunning()) failStage(deps, reporter, ticket.key, `Repository konnte nicht geladen werden. (${describeError(err)})`)
    return
  }

  const codebaseSummary = await deps.repos.ensureSummary(repoDir, request.model, reporter.report)
  if (!codebaseSummary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  if (!stillRunning()) return

  reporter.progress('Agent wird gestartet...')
  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary })
}
