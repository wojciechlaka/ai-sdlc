import { artifactPath, parseAppBranch } from '../domain/artifacts'
import { reconcile, stageFromRepo } from '../domain/rules'
import type { CodeHost } from '../ports'
import type { UseCaseDeps } from './deps'
import { describeError } from './describeError'
import { createReporter } from './reporter'
import { sleep } from './sleep'
import { syncReviews } from './syncReviews'

/**
 * Start of the app (spec §3), before requests are served. Without token, or when GitHub fails,
 * the app continues with the database state and logs a warning.
 */
export async function startup(deps: UseCaseDeps): Promise<void> {
  endInterruptedRuns(deps)
  importTickets(deps)

  const host = deps.codeHost
  if (!host) {
    console.warn('[startup] GITHUB_TOKEN fehlt — Abgleich mit GitHub übersprungen')
    return
  }
  try {
    await syncReviews(deps)
    await closeOpenPullRequests(deps, host)
    await host.baseBranch() // guard: a repo-level failure must not reset tickets to plan
    await deriveStages(deps, host)
  } catch (err) {
    console.warn(`[startup] GitHub-Abgleich fehlgeschlagen, weiter mit DB-Stand: ${describeError(err)}`)
  }
}

/** Stops running agents, empties the database and runs the start again. */
export async function resetSystem(deps: UseCaseDeps): Promise<void> {
  let stopped = 0
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') {
      deps.agent.stop(ticket.key)
      stopped++
    }
  }
  if (stopped > 0) await sleep(deps.stopSettleMs)
  deps.tickets.clear()
  await startup(deps)
}

/** Runs still `running` were cut off by the restart; their tickets start over as `ready`. */
function endInterruptedRuns(deps: UseCaseDeps): void {
  for (const run of deps.runs.findStuck()) {
    deps.runs.fail(run.id, 'failed')
    deps.audit.append({ ticketKey: run.ticketKey, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: 'failed', reason: 'Neustart' } })
  }
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') deps.tickets.update(ticket.key, { state: 'ready' })
  }
}

function importTickets(deps: UseCaseDeps): void {
  const items = deps.source.list()
  const created = new Set(deps.tickets.upsertFromSource(items))
  for (const item of items) {
    if (created.has(item.key)) {
      deps.audit.append({ ticketKey: item.key, actor: 'system', type: 'ticket_imported', payload: { sourcePath: item.sourcePath } })
    }
  }
  console.log(`[startup] ${items.length} Ticket(s) gelesen, ${created.size} neu`)
}

/** Closes every open PR of the app (head branch `<KEY>/intent|spec` of a known ticket) and deletes its branch. */
async function closeOpenPullRequests(deps: UseCaseDeps, host: CodeHost): Promise<void> {
  const keys = new Set(deps.tickets.list().map((t) => t.key))
  for (const pr of await host.listOpenPullRequests()) {
    const owner = parseAppBranch(pr.headBranch, keys)
    if (!owner) continue
    try {
      await host.closePullRequest(pr.number)
      await host.deleteBranch(pr.headBranch)
      const artifact = deps.artifacts.findOpen(owner.key, owner.stage)
      if (artifact) deps.artifacts.markClosed(artifact.id)
      deps.audit.append({ ticketKey: owner.key, actor: 'system', type: 'cleanup', payload: { prNumber: pr.number, branch: pr.headBranch } })
    } catch (err) {
      console.warn(`[startup] PR #${pr.number} (${pr.headBranch}) nicht aufgeräumt: ${describeError(err)}`)
    }
  }
}

/** Sets each ticket to the stage its merged artifacts on the default branch imply. */
async function deriveStages(deps: UseCaseDeps, host: CodeHost): Promise<void> {
  for (const { key } of deps.tickets.list()) {
    try {
      const [intent, spec] = await Promise.all([
        host.readFile(artifactPath(key, 'plan')),
        host.readFile(artifactPath(key, 'design')),
      ])
      // A run may have started while we waited for GitHub.
      const current = deps.tickets.findByKey(key)
      if (!current || current.state === 'running') continue
      const next = reconcile(current, stageFromRepo({ hasIntent: intent !== null, hasSpec: spec !== null }))
      if (next.stage === current.stage && next.state === current.state) continue
      if (next.stage !== current.stage) {
        deps.audit.append({ ticketKey: key, actor: 'system', type: 'stage_changed', payload: { from: current.stage, to: next.stage } })
      }
      createReporter(deps, key).setState(next.state, next.stage)
    } catch (err) {
      console.warn(`[startup] ${key}: Stufe nicht abgeleitet: ${describeError(err)}`)
    }
  }
}
