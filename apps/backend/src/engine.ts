import path from 'path'
import { createRefinementEngine, resolveCorePaths } from '@refinement/core'

const CORE_DIR = path.resolve(__dirname, '../../../packages/core')

/** Process-wide engine of the Hono transition adapter (removed in part 3). */
export const engine = createRefinementEngine({
  dbPath: process.env.DB_PATH ?? path.join(__dirname, '../data/refinement.db'),
  ...resolveCorePaths(CORE_DIR),
})
