import type { ArtifactStage, Ticket } from '../domain/types'
import { artifactPath, artifactTitle, branchName } from '../domain/artifacts'
import { renderPullRequestBody } from '../domain/render'
import type { UseCaseDeps } from './deps'
import { isCurrentRun } from './runLifecycle'
import { describeError } from '../domain/errors'
import { TOKEN_MISSING } from './messages'
import { createReporter } from './reporter'

/**
 * Proposes the artifact via its own branch and PR, records it and moves the ticket to `in_review`.
 * A branch left over from an earlier attempt is replaced.
 * If the attempt is no longer current once the PR is open (stop, restart, reset), the PR is closed
 * and the branch deleted again; nothing is recorded.
 * @throws {CodeHostError} when a GitHub step fails — the caller marks the stage failed.
 */
export async function publishArtifact(
  deps: UseCaseDeps,
  ticket: Ticket,
  stage: ArtifactStage,
  artifact: { markdown: string; summary: string },
  runId: string,
): Promise<void> {
  const host = deps.codeHost
  if (!host) throw new Error(TOKEN_MISSING)

  const branch = branchName(ticket.key, stage)
  const path = artifactPath(ticket.key, stage)
  const title = artifactTitle(ticket.key, stage)

  if (!isCurrentRun(deps, ticket.key, runId)) return
  await host.deleteBranch(branch)
  await host.createBranch(branch)
  await host.commitFile({ branch, path, content: artifact.markdown, message: title })
  const pr = await host.openPullRequest({ branch, title, body: renderPullRequestBody(ticket, stage, artifact.summary) })

  if (!isCurrentRun(deps, ticket.key, runId)) {
    createReporter(deps, ticket.key).log(`Attempt no longer current — closing PR #${pr.number}`)
    await host.closePullRequest(pr.number).catch((err) => console.warn(`Closing PR #${pr.number} failed: ${describeError(err)}`))
    await host.deleteBranch(branch).catch((err) => console.warn(`Deleting branch ${branch} failed: ${describeError(err)}`))
    return
  }

  deps.artifacts.create({ ticketKey: ticket.key, stage, path, branch, prNumber: pr.number, prUrl: pr.url })
  deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'pr_opened', payload: { prNumber: pr.number, prUrl: pr.url, branch } })
  createReporter(deps, ticket.key).setState('in_review')
}
