import { ARTIFACT_STAGES, WORK_DIR, artifactPath, branchName, parseAppBranch } from '../domain/artifacts'
import { reconcile, stageFromRepo } from '../domain/rules'
import type { CodeHost } from '../ports'
import type { UseCaseDeps } from './deps'
import { ConflictError, describeError } from '../domain/errors'
import { RESET_RUNNING } from './messages'
import { createReporter } from './reporter'
import { sleep } from './sleep'
import { syncReviews } from './syncReviews'
import { record } from './auditTrail'

/** Options of `startup`; a plain restart passes none. */
export interface StartupOptions {
  /** Also resets the target repo: app branches deleted, base branch force-moved to the baseline tag (spec §12). */
  resetRepo?: boolean
}

/** Outcome of `startup` and `resetSystem`. */
export interface StartupReport {
  /** Every problem that was caught and logged, user-facing; empty when everything worked. */
  warnings: string[]
}

type Warn = (message: string) => void

/**
 * Start of the app (spec §3, §12), before requests are served. Without token, or when GitHub fails,
 * the app continues with the database state; each problem is logged and reported as warning.
 */
export async function startup(deps: UseCaseDeps, { resetRepo = false }: StartupOptions = {}): Promise<StartupReport> {
  const warnings: string[] = []
  const warn: Warn = (message) => {
    console.warn(`[startup] ${message}`)
    warnings.push(message)
  }

  endInterruptedRuns(deps)
  importTickets(deps)

  const host = deps.codeHost
  if (!host) {
    warn('GITHUB_TOKEN fehlt — Abgleich mit GitHub übersprungen')
    return { warnings }
  }
  try {
    // Also the guard for deriveStages: it reads tag and base branch, so a repo-level failure
    // (wrong repo, no access) stops here instead of resetting tickets to plan.
    await prepareBaseBranch(deps, host, warn)
    // Settles PRs merged or closed since the last start, so no artifact stays open (also before a reset).
    await syncReviews(deps)
    await closeOpenPullRequests(deps, host, warn)
    if (resetRepo) {
      await resetRepository(deps, host, warn)
    }
    await deriveStages(deps, host, warn)
  } catch (err) {
    warn(`GitHub-Abgleich fehlgeschlagen, weiter mit DB-Stand: ${describeError(err)}`)
  }
  return { warnings }
}

/**
 * Stops running agents, empties the database and runs the start again, including the repo reset.
 * Until it finishes, starting or answering a stage (and a second reset) is rejected.
 * @throws {ConflictError} while another reset runs.
 */
export async function resetSystem(deps: UseCaseDeps): Promise<StartupReport> {
  if (deps.resetState.resetting) {
    throw new ConflictError(RESET_RUNNING)
  }
  deps.resetState.resetting = true
  try {
    let stopped = 0
    for (const ticket of deps.tickets.list()) {
      if (ticket.state === 'running') {
        deps.agent.stop(ticket.key)
        stopped++
      }
    }
    if (stopped > 0) {
      await sleep(deps.stopSettleMs)
    }
    deps.tickets.clear()
    return await startup(deps, { resetRepo: true })
  } finally {
    deps.resetState.resetting = false
  }
}

/** Creates the baseline tag and the base branch if they are missing. */
async function prepareBaseBranch(deps: UseCaseDeps, host: CodeHost, warn: Warn): Promise<void> {
  const { createdTag, createdBranch, baselineHasWork } = await host.prepareBaseBranch()
  if (createdTag) {
    console.log('[startup] Baseline tag created on the default branch')
  }
  if (createdBranch) {
    console.log(`[startup] Branch ${deps.baseBranch} created at the baseline tag`)
  }
  if (baselineHasWork) {
    warn(`Ausgangsstand ${deps.baselineTag} enthält bereits ${WORK_DIR} — diese Tickets starten nicht in Stufe 1`)
  }
}

/**
 * Deletes the branches `<KEY>/intent|spec` of all known tickets, also leftovers of merged PRs,
 * and moves the base branch back to the baseline tag. A failed reset is a warning; stages are derived anyway.
 */
async function resetRepository(deps: UseCaseDeps, host: CodeHost, warn: Warn): Promise<void> {
  for (const { key } of deps.tickets.list()) {
    for (const stage of ARTIFACT_STAGES) {
      const branch = branchName(key, stage)
      try {
        await host.deleteBranch(branch)
      } catch (err) {
        warn(`Branch ${branch} nicht gelöscht: ${describeError(err)}`)
      }
    }
  }
  try {
    await host.resetBaseBranch()
    console.log('[startup] Repository reset')
  } catch (err) {
    warn(`Repo nicht zurückgesetzt: ${describeError(err)}`)
  }
}

/** Runs still `running` were cut off by the restart; their tickets start over as `ready`. */
function endInterruptedRuns(deps: UseCaseDeps): void {
  for (const run of deps.runs.findStuck()) {
    deps.runs.fail(run.id, 'failed')
    record(deps, run.ticketKey, 'system', 'run_finished', { runId: run.id, status: 'failed', reason: 'Neustart' })
  }
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') {
      deps.tickets.update(ticket.key, { state: 'ready' })
    }
  }
}

function importTickets(deps: UseCaseDeps): void {
  const items = deps.source.list()
  const created = new Set(deps.tickets.upsertFromSource(items))
  for (const item of items) {
    if (created.has(item.key)) {
      record(deps, item.key, 'system', 'ticket_imported', { sourcePath: item.sourcePath })
    }
  }
  console.log(`[startup] ${items.length} ticket(s) read, ${created.size} new`)
}

/** Closes every open PR of the app (head branch `<KEY>/intent|spec` of a known ticket) and deletes its branch. */
async function closeOpenPullRequests(deps: UseCaseDeps, host: CodeHost, warn: Warn): Promise<void> {
  const keys = new Set(deps.tickets.list().map((t) => t.key))
  for (const pr of await host.listOpenPullRequests()) {
    const owner = parseAppBranch(pr.headBranch, keys)
    if (!owner) {
      continue
    }
    try {
      await host.closePullRequest(pr.number)
      await host.deleteBranch(pr.headBranch)
      const artifact = deps.artifacts.findOpen(owner.key, owner.stage)
      if (artifact) {
        deps.artifacts.markClosed(artifact.id)
      }
      record(deps, owner.key, 'system', 'cleanup', { prNumber: pr.number, branch: pr.headBranch })
    } catch (err) {
      warn(`PR #${pr.number} (${pr.headBranch}) nicht aufgeräumt: ${describeError(err)}`)
    }
  }
}

/** Sets each ticket to the stage its merged artifacts on the base branch imply. */
async function deriveStages(deps: UseCaseDeps, host: CodeHost, warn: Warn): Promise<void> {
  for (const { key } of deps.tickets.list()) {
    try {
      const [intent, spec] = await Promise.all([
        host.readFile(artifactPath(key, 'plan')),
        host.readFile(artifactPath(key, 'design')),
      ])
      // A run may have started while we waited for GitHub.
      const current = deps.tickets.findByKey(key)
      if (!current || current.state === 'running') {
        continue
      }
      const next = reconcile(current, stageFromRepo({ hasIntent: intent !== null, hasSpec: spec !== null }))
      if (next.stage === current.stage && next.state === current.state) {
        continue
      }
      if (next.stage !== current.stage) {
        record(deps, key, 'system', 'stage_changed', { from: current.stage, to: next.stage })
      }
      createReporter(deps, key).setState(next.state, next.stage)
    } catch (err) {
      warn(`${key}: Stufe nicht abgeleitet: ${describeError(err)}`)
    }
  }
}
