import 'server-only'
import path from 'path'
import { createRefinementEngine, resolveCorePaths, type UseCases } from '@refinement/core'

const globalForEngine = globalThis as typeof globalThis & { __refinementEngine?: UseCases }

/**
 * Composition root of the web app: one engine per process.
 * Kept on globalThis because Next.js loads modules into several bundles (pages, actions,
 * route handlers) and reloads them in dev — all must share the same database connection,
 * event bus and running agent processes.
 */
export function getEngine(): UseCases {
  if (!globalForEngine.__refinementEngine) {
    // `next dev` / `next start` run with apps/web as working directory (npm -w).
    const coreDir = path.resolve(process.cwd(), '..', '..', 'packages', 'core')
    const engine = createRefinementEngine({
      dbPath: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'refinement.db'),
      ...resolveCorePaths(coreDir),
    })
    engine.startup()
    globalForEngine.__refinementEngine = engine
  }
  return globalForEngine.__refinementEngine
}
