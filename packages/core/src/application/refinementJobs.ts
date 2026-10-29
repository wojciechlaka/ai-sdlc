import type { StartRefinementInput } from '@refinement/shared'
import type { Ticket } from '../domain/types'
import { planAnswerRun } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { createReporter, type Reporter } from './reporter'
import { executeRun } from './executeRun'

function describeRepoError(err: unknown): string {
  const stderr = (err as { stderr?: Buffer } | null)?.stderr?.toString().trim()
  return stderr || (err instanceof Error ? err.message : String(err))
}

/** Clones/updates the repo. On failure the ticket is marked failed and null is returned. */
async function prepareRepo(deps: UseCaseDeps, reporter: Reporter, repoUrl: string): Promise<string | null> {
  try {
    return await deps.repos.ensureRepo(repoUrl)
  } catch (err) {
    const detail = describeRepoError(err)
    reporter.log(`Repository error: ${detail}`)
    reporter.setStatus('failed')
    reporter.progress(`Fehler: Repository konnte nicht geladen werden. (${detail})`)
    return null
  }
}

/** Background job of `startRefinement`: repo → summary → first agent run. */
export async function runInitialRefinement(deps: UseCaseDeps, ticket: Ticket, params: StartRefinementInput): Promise<void> {
  const reporter = createReporter(deps, ticket.id)
  reporter.log(`Starting refinement for "${ticket.title}"`)

  reporter.progress('Repository wird vorbereitet...')
  const repoDir = await prepareRepo(deps, reporter, params.repo)
  if (!repoDir) return
  reporter.progress('Repository bereit.')

  const summary = await deps.repos.ensureSummary(repoDir, params.model, reporter.report)
  if (!summary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  reporter.progress('Agent wird gestartet...')

  await executeRun(deps, ticket.id, {
    trigger: 'initial',
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

/** Background job of `answerQuestion`: continues with the Q&A history in a new agent run. */
export async function runAnswer(deps: UseCaseDeps, ticket: Ticket, answer: string): Promise<void> {
  const reporter = createReporter(deps, ticket.id)
  const plan = planAnswerRun(deps.runs.listForTicket(ticket.id), answer)
  if (!plan) {
    reporter.log('ERROR: no pending question found — aborting answer run')
    return
  }
  const initialInput = plan.questionRun.input

  // Ticket is already 'refining' — no status transition needed, the progress event signals the start.
  reporter.progress('Antwort empfangen — Agent analysiert Antwort...')
  reporter.log(`Starting answer run for "${ticket.title}" (${plan.previousRuns.length} Q&A pair(s))`)

  const repoDir = await prepareRepo(deps, reporter, initialInput.repo)
  if (!repoDir) return

  const summary = await deps.repos.ensureSummary(repoDir, initialInput.model, reporter.report)
  reporter.progress('Agent wird gestartet...')

  await executeRun(deps, ticket.id, {
    trigger: 'answer',
    repoPath: repoDir,
    codebaseSummary: summary,
    previousRuns: plan.previousRuns,
    input: {
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      acceptanceCriteria: initialInput.acceptanceCriteria,
      repo: initialInput.repo,
      model: initialInput.model,
      previousRuns: plan.previousRuns,
    },
  })
}
