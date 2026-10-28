/** A local app receives no GitHub webhooks, so it polls the PRs of tickets in review. */
const SYNC_INTERVAL_MS = 60_000

const globalForTimer = globalThis as typeof globalThis & { __reviewSyncTimer?: ReturnType<typeof setInterval> }

/**
 * Runs once when the Next.js server starts, before the first request: migrations, ticket import,
 * clean-up of open app PRs and stage derivation (see `startup` in packages/core). With
 * `RESET_ON_START=true` the target repo is reset as well (branch `showcase` back to `showcase-base`).
 * Then starts the review sync timer.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { getEngine } = await import('./lib/container')
  const engine = getEngine()
  try {
    await engine.startup({ resetRepo: process.env.RESET_ON_START === 'true' })
  } catch (err) {
    console.error('[startup] App konnte nicht starten:', err)
    throw err
  }

  // register() may run again (dev reloads); one timer per process is enough.
  if (globalForTimer.__reviewSyncTimer) return
  const timer = setInterval(() => {
    engine.syncReviews().catch((err) => console.warn('[sync] PR-Abgleich fehlgeschlagen', err))
  }, SYNC_INTERVAL_MS)
  timer.unref()
  globalForTimer.__reviewSyncTimer = timer
}
