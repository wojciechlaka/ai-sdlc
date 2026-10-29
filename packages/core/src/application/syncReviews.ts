import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { currentArtifactStage, nextStage } from '../domain/rules'
import { CodeHostError, type CodeHost, type PullRequest } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from '../domain/errors'
import { requireTicket } from './requireTicket'
import { record } from './auditTrail'

const NOT_FOUND = 404

/**
 * Applies what happened to the PRs of tickets in review (all, or the one given):
 * merged → next stage; closed without merge → branch deleted, `ready`.
 * GitHub errors leave the ticket as it is; the next sync retries. Never throws for GitHub errors.
 * @throws {NotFoundError} for an unknown `key`.
 */
export async function syncReviews(deps: UseCaseDeps, key?: string): Promise<void> {
  const host = deps.codeHost
  const tickets = key ? [requireTicket(deps.tickets, key)] : deps.tickets.list()
  if (!host) return

  for (const ticket of tickets) {
    const stage = currentArtifactStage(ticket)
    if (ticket.state !== 'in_review' || !stage) continue
    const artifact = deps.artifacts.findOpen(ticket.key, stage)
    if (!artifact) {
      record(deps, ticket.key, 'system', 'error', { message: 'Kein offener PR zur Stufe gefunden' })
      createReporter(deps, ticket.key).setState('ready')
      continue
    }
    await syncOne(deps, host, ticket, stage, artifact)
  }
}

async function syncOne(deps: UseCaseDeps, host: CodeHost, ticket: Ticket, stage: ArtifactStage, artifact: Artifact): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const fetched = await fetchPullRequest(host, artifact.prNumber)

  // A concurrent sync (timer and page) may have handled the ticket while we waited.
  if (deps.tickets.findByKey(ticket.key)?.state !== 'in_review') return
  if (deps.artifacts.findOpen(ticket.key, stage)?.id !== artifact.id) return

  if ('error' in fetched) {
    const failure = fetched.error
    if (failure instanceof CodeHostError && failure.status === NOT_FOUND) {
      deps.artifacts.markClosed(artifact.id)
      record(deps, ticket.key, 'system', 'error', { message: `PR #${artifact.prNumber} gibt es nicht mehr` })
      reporter.setState('ready')
    } else {
      console.warn(`[syncReviews] ${ticket.key}: ${describeError(failure)}`)
    }
    return
  }

  const { pr } = fetched
  if (pr.state === 'merged') {
    deps.artifacts.markMerged(artifact.id, pr.mergedAt ?? new Date())
    record(deps, ticket.key, 'human', 'pr_merged', { prNumber: pr.number })
    const next = nextStage(stage)
    record(deps, ticket.key, 'system', 'stage_changed', { from: stage, to: next })
    reporter.setState('ready', next)
  } else if (pr.state === 'closed') {
    deps.artifacts.markClosed(artifact.id)
    record(deps, ticket.key, 'human', 'pr_closed', { prNumber: pr.number })
    reporter.setState('ready')
    try {
      await host.deleteBranch(artifact.branch)
    } catch (err) {
      console.warn(`[syncReviews] ${ticket.key}: branch ${artifact.branch} not deleted: ${describeError(err)}`)
    }
  }
}

/** The PR, or the error the code host threw; the caller decides after re-checking the ticket. */
async function fetchPullRequest(host: CodeHost, prNumber: number): Promise<{ pr: PullRequest } | { error: unknown }> {
  try {
    return { pr: await host.getPullRequest(prNumber) }
  } catch (error) {
    return { error }
  }
}
