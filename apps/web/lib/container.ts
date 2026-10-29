import 'server-only'
import path from 'path'
import { createRefinementEngine, resolveCorePaths, type UseCases } from '@refinement/core'
import { positiveInt } from './env'

/** Fork of the RealWorld example backend; override with `TARGET_REPO` in `apps/web/.env.local`. */
const DEFAULT_TARGET_REPO = 'https://github.com/wojciechlaka/node-express-realworld-example-app'

const globalForEngine = globalThis as typeof globalThis & { __refinementEngine?: UseCases }

/**
 * Composition root of the web app: one engine per process.
 * Kept on globalThis because Next.js loads modules into several bundles (pages, actions,
 * route handlers) and reloads them in dev — all must share the same database connection,
 * event bus and running agent processes. `startup()` runs in `instrumentation.ts`.
 */
export function getEngine(): UseCases {
  if (!globalForEngine.__refinementEngine) {
    // `next dev` / `next start` run with apps/web as working directory (npm -w).
    const rootDir = path.resolve(process.cwd(), '..', '..')
    globalForEngine.__refinementEngine = createRefinementEngine({
      dbPath: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'refinement.db'),
      ...resolveCorePaths(path.join(rootDir, 'packages', 'core')),
      ticketsDir: path.join(rootDir, 'examples', 'tickets'),
      rootDir,
      targetRepo: process.env.TARGET_REPO || DEFAULT_TARGET_REPO,
      githubToken: process.env.GITHUB_TOKEN || undefined,
      agentTimeoutMs: positiveInt(process.env.REFINEMENT_TIMEOUT_MS),
      repoCacheDir: process.env.REPO_CACHE_DIR,
    })
  }
  return globalForEngine.__refinementEngine
}
