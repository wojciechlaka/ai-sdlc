import path from 'path'
import { createUseCases, type UseCases } from './application/createUseCases'
import { createSqliteDatabase } from './adapters/sqlite/database'
import { createSqliteTicketRepository } from './adapters/sqlite/ticketRepository'
import { createSqliteAgentRunRepository } from './adapters/sqlite/agentRunRepository'
import { createSqliteAuditLog } from './adapters/sqlite/auditLog'
import { createClaudeCliAgentRunner } from './adapters/claudeCli'
import { createGitRepoProvider } from './adapters/git/repoCache'
import { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'

export interface EngineConfig {
  /** SQLite file; parent directories are created. */
  dbPath: string
  /** `packages/core/drizzle` */
  migrationsFolder: string
  /** `packages/core/skills/refinement-agent.md` */
  skillPath: string
}

const STOP_SETTLE_MS = 500

/**
 * Paths of the assets shipped with this package. Passed in from the app because bundlers
 * (Next.js) relocate the code, so `__dirname` inside the package is not reliable.
 * @param coreDir - Absolute path to `packages/core`.
 */
export function resolveCorePaths(coreDir: string): Pick<EngineConfig, 'migrationsFolder' | 'skillPath'> {
  return {
    migrationsFolder: path.join(coreDir, 'drizzle'),
    skillPath: path.join(coreDir, 'skills', 'refinement-agent.md'),
  }
}

/** Composition of the production adapters. Call once per process and keep the result. */
export function createRefinementEngine(config: EngineConfig): UseCases {
  const db = createSqliteDatabase({ path: config.dbPath, migrationsFolder: config.migrationsFolder })
  return createUseCases({
    tickets: createSqliteTicketRepository(db),
    runs: createSqliteAgentRunRepository(db),
    audit: createSqliteAuditLog(db),
    agent: createClaudeCliAgentRunner({ skillPath: config.skillPath }),
    repos: createGitRepoProvider(),
    events: createNodeEventPublisher(),
    runInBackground: (task) => {
      task.catch((err) => console.error('[background] unhandled error in agent run', err))
    },
    stopSettleMs: STOP_SETTLE_MS,
  })
}
