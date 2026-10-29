import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { currentArtifactStage, nextStage } from '../domain/rules'
import { CodeHostError, type CodeHost, type PullRequest } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { requireTicket } from './requireTicket'

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
      deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'error', payload: { message: 'Kein offener PR zur Stufe gefunden' } })
      createReporter(deps, ticket.key).setState('ready')
      continue
    }
    await syncOne(deps, host, ticket, stage, artifact)
  }
}

async function syncOne(deps: UseCaseDeps, host: CodeHost, ticket: Ticket, stage: ArtifactStage, artifact: Artifact): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  let pr: PullRequest | null = null
  let failure: unknown = null
  try {
    pr = await host.getPullRequest(artifact.prNumber)
  } catch (err) {
    failure = err
  }

  // A concurrent sync (timer and page) may have handled the ticket while we waited.
  if (deps.tickets.findByKey(ticket.key)?.state !== 'in_review') return
  if (deps.artifacts.findOpen(ticket.key, stage)?.id !== artifact.id) return

  if (!pr) {
    if (failure instanceof CodeHostError && failure.status === NOT_FOUND) {
      deps.artifacts.markClosed(artifact.id)
      deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'error', payload: { message: `PR #${artifact.prNumber} gibt es nicht mehr` } })
      reporter.setState('ready')
    } else {
      console.warn(`[syncReviews] ${ticket.key}: ${describeError(failure)}`)
    }
    return
  }

  if (pr.state === 'merged') {
    deps.artifacts.markMerged(artifact.id, pr.mergedAt ?? new Date())
    deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'pr_merged', payload: { prNumber: pr.number } })
    const next = nextStage(stage)
    deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'stage_changed', payload: { from: stage, to: next } })
    reporter.setState('ready', next)
  } else if (pr.state === 'closed') {
    deps.artifacts.markClosed(artifact.id)
    deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'pr_closed', payload: { prNumber: pr.number } })
    reporter.setState('ready')
    try {
      await host.deleteBranch(artifact.branch)
    } catch (err) {
      console.warn(`[syncReviews] ${ticket.key}: branch ${artifact.branch} not deleted: ${describeError(err)}`)
    }
  }
}
