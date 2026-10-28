/** A local app receives no GitHub webhooks, so it polls the PRs of tickets in review. */
const SYNC_INTERVAL_MS = 60_000

/**
 * Runs once when the Next.js server starts, before the first request: migrations, ticket import,
 * clean-up of open app PRs and stage derivation (see `startup` in packages/core). Then starts
 * the review sync timer.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { getEngine } = await import('./lib/container')
  const engine = getEngine()
  await engine.startup()

  const timer = setInterval(() => {
    engine.syncReviews().catch((err) => console.warn('[sync] PR-Abgleich fehlgeschlagen', err))
  }, SYNC_INTERVAL_MS)
  timer.unref()
}
