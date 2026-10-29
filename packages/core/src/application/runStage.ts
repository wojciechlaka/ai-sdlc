import type { ArtifactStage, Ticket } from '../domain/types'
import { artifactPath } from '../domain/artifacts'
import type { UseCaseDeps } from './deps'
import { createReporter, type Reporter } from './reporter'
import { describeError } from '../domain/errors'
import { finishRun, isCurrentRun, type RunRequest } from './runLifecycle'
import { executeRun } from './executeRun'
import { failStage } from './failStage'
import { INTENT_MISSING, TOKEN_MISSING } from './messages'

/**
 * Background job of `startStage` and `answerQuestion`: read the merged intent (design) → update the clone →
 * codebase summary → agent run. Never throws. Stops early when the ticket was stopped in between.
 */
export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: RunRequest & { runId: string }): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const { runId } = request
  reporter.log(`Starting stage ${request.stage} (${request.trigger}) for "${ticket.title}"`)

  let intent: string | undefined
  try {
    intent = await readIntent(deps, ticket, request.stage, reporter)
  } catch (err) {
    failAttempt(deps, reporter, ticket.key, runId, describeError(err))
    return
  }
  if (!stillCurrentOrFinish(deps, ticket.key, runId)) {
    return
  }

  reporter.progress('Repository wird vorbereitet…')
  let repoDir: string
  try {
    repoDir = await deps.repos.ensureRepo(deps.repoUrl)
  } catch (err) {
    failAttempt(deps, reporter, ticket.key, runId, `Repository konnte nicht geladen werden. (${describeError(err)})`)
    return
  }

  if (!stillCurrentOrFinish(deps, ticket.key, runId)) {
    return
  }

  const codebaseSummary = await deps.repos.ensureSummary(repoDir, request.model, reporter.logAndProgress)
  if (!codebaseSummary) {
    reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  }
  if (!stillCurrentOrFinish(deps, ticket.key, runId)) {
    return
  }

  reporter.progress('Agent wird gestartet…')
  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary, intent })
}

/**
 * The merged `intent.md` a design run builds on, read from the base branch; undefined for the plan stage.
 * @throws {Error} with a German message when the intent is missing (stage 1 not merged yet).
 * @throws {CodeHostError} when GitHub cannot be read.
 */
async function readIntent(deps: UseCaseDeps, ticket: Ticket, stage: ArtifactStage, reporter: Reporter): Promise<string | undefined> {
  if (stage !== 'design') {
    return undefined
  }
  if (!deps.codeHost) {
    throw new Error(TOKEN_MISSING)
  }
  reporter.progress('Intent wird gelesen…')
  const intent = await deps.codeHost.readFile(artifactPath(ticket.key, 'plan'))
  if (intent === null) {
    throw new Error(INTENT_MISSING)
  }
  return intent
}

/** Ends the run as failed; a current attempt also fails the stage with `message` (German, shown on the page). */
function failAttempt(deps: UseCaseDeps, reporter: Reporter, ticketKey: string, runId: string, message: string): void {
  const current = isCurrentRun(deps, ticketKey, runId)
  finishRun(deps, ticketKey, runId, 'failed')
  if (current) {
    failStage(deps, reporter, ticketKey, message)
  }
}

/**
 * Checkpoint between two background steps: true while the attempt is current; otherwise ends its run as failed
 * (the stop, restart or reset that made it stale already set the ticket state).
 */
function stillCurrentOrFinish(deps: UseCaseDeps, ticketKey: string, runId: string): boolean {
  if (isCurrentRun(deps, ticketKey, runId)) {
    return true
  }
  finishRun(deps, ticketKey, runId, 'failed')
  return false
}
