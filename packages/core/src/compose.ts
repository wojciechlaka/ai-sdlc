import path from 'path'
import { createUseCases, type UseCases } from './application/createUseCases'
import { createSqliteDatabase } from './adapters/sqlite/database'
import { createSqliteTicketRepository } from './adapters/sqlite/ticketRepository'
import { createSqliteAgentRunRepository } from './adapters/sqlite/agentRunRepository'
import { createSqliteArtifactRepository } from './adapters/sqlite/artifactRepository'
import { createSqliteAuditLog } from './adapters/sqlite/auditLog'
import { createMarkdownTicketSource } from './adapters/markdownTickets/markdownTicketSource'
import { createGitHubCodeHost, parseGitHubRepoUrl } from './adapters/github/githubCodeHost'
import { createClaudeCliAgentRunner } from './adapters/claudeCli'
import { createGitRepoProvider } from './adapters/git/repoCache'
import { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'

export interface EngineConfig {
  /** SQLite file; parent directories are created. */
  dbPath: string
  /** `packages/core/drizzle` */
  migrationsFolder: string
  /** `packages/core/skills` */
  skillsDir: string
  /** Directory with the ticket files (`examples/tickets`). */
  ticketsDir: string
  /** Repository root; ticket source paths are shown relative to it. */
  rootDir: string
  /** Target repository on GitHub (`TARGET_REPO`). */
  targetRepo: string
  /** Fine-grained PAT (`GITHUB_TOKEN`); without it stages cannot be started. */
  githubToken?: string
}

const STOP_SETTLE_MS = 500

/** Branch the app works on; PRs target it, `master` stays untouched (spec §12). */
export const SHOWCASE_BRANCH = 'showcase'
/** Tag marking the initial state of the showcase branch; the repo reset moves the branch back to it. */
export const BASELINE_TAG = 'showcase-base'

/**
 * Paths of the assets shipped with this package. Passed in from the app because bundlers
 * (Next.js) relocate the code, so `__dirname` inside the package is not reliable.
 * @param coreDir - Absolute path to `packages/core`.
 */
export function resolveCorePaths(coreDir: string): Pick<EngineConfig, 'migrationsFolder' | 'skillsDir'> {
  return {
    migrationsFolder: path.join(coreDir, 'drizzle'),
    skillsDir: path.join(coreDir, 'skills'),
  }
}

/** Composition of the production adapters. Call once per process and keep the result. */
export function createRefinementEngine(config: EngineConfig): UseCases {
  // Fail at start with the clear message, with or without token.
  parseGitHubRepoUrl(config.targetRepo)
  const db = createSqliteDatabase({ path: config.dbPath, migrationsFolder: config.migrationsFolder })
  return createUseCases({
    tickets: createSqliteTicketRepository(db),
    runs: createSqliteAgentRunRepository(db),
    artifacts: createSqliteArtifactRepository(db),
    audit: createSqliteAuditLog(db),
    source: createMarkdownTicketSource({ dir: config.ticketsDir, rootDir: config.rootDir }),
    codeHost: config.githubToken
      ? createGitHubCodeHost({ repoUrl: config.targetRepo, token: config.githubToken, baseBranch: SHOWCASE_BRANCH, baselineTag: BASELINE_TAG })
      : null,
    agent: createClaudeCliAgentRunner({ skillsDir: config.skillsDir }),
    repos: createGitRepoProvider(),
    events: createNodeEventPublisher(),
    repoUrl: config.targetRepo,
    runInBackground: (task) => {
      task.catch((err) => console.error('[background] unhandled error in agent run', err))
    },
    stopSettleMs: STOP_SETTLE_MS,
  })
}
