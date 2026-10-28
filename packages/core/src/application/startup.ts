import { artifactPath, parseAppBranch } from '../domain/artifacts'
import { reconcile, stageFromRepo } from '../domain/rules'
import type { CodeHost } from '../ports'
import type { UseCaseDeps } from './deps'
import { describeError } from './describeError'
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
    await deriveStages(deps, host)
  } catch (err) {
    console.warn(`[startup] GitHub-Abgleich fehlgeschlagen, weiter mit DB-Stand: ${describeError(err)}`)
  }
}

/** Stops running agents, empties the database and runs the start again. */
export async function resetSystem(deps: UseCaseDeps): Promise<void> {
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') deps.agent.stop(ticket.key)
  }
  await sleep(deps.stopSettleMs)
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
    await host.closePullRequest(pr.number)
    await host.deleteBranch(pr.headBranch)
    const artifact = deps.artifacts.findOpen(owner.key, owner.stage)
    if (artifact) deps.artifacts.markClosed(artifact.id)
    deps.audit.append({ ticketKey: owner.key, actor: 'system', type: 'cleanup', payload: { prNumber: pr.number, branch: pr.headBranch } })
  }
}

/** Sets each ticket to the stage its merged artifacts on the default branch imply. */
async function deriveStages(deps: UseCaseDeps, host: CodeHost): Promise<void> {
  for (const ticket of deps.tickets.list()) {
    const [intent, spec] = await Promise.all([
      host.readFile(artifactPath(ticket.key, 'plan')),
      host.readFile(artifactPath(ticket.key, 'design')),
    ])
    const next = reconcile(ticket, stageFromRepo({ hasIntent: intent !== null, hasSpec: spec !== null }))
    if (next.stage !== ticket.stage) {
      deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'stage_changed', payload: { from: ticket.stage, to: next.stage } })
    }
    if (next.stage !== ticket.stage || next.state !== ticket.state) deps.tickets.update(ticket.key, next)
  }
}
