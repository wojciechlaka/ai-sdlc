import os from 'os'
import path from 'path'
import { createUseCases, type UseCases } from './application/createUseCases'
import type { UseCaseDeps } from './application/deps'
import type { CodeHost } from './ports/codeHost'
import { createSqliteDatabase, type SqliteDatabaseOptions } from './adapters/sqlite/database'
import { createSqliteTicketRepository } from './adapters/sqlite/ticketRepository'
import { createSqliteAgentRunRepository } from './adapters/sqlite/agentRunRepository'
import { createSqliteArtifactRepository } from './adapters/sqlite/artifactRepository'
import { createSqliteAuditLog } from './adapters/sqlite/auditLog'
import { createMarkdownTicketSource, type MarkdownTicketSourceOptions } from './adapters/markdownTickets/markdownTicketSource'
import { createGitHubCodeHost, parseGitHubRepoUrl, type GitHubCodeHostOptions } from './adapters/github/githubCodeHost'
import { createClaudeCliAgentRunner, type ClaudeCliOptions } from './adapters/claudeCli/claudeCliAgentRunner'
import { createGitRepoProvider, type RepoCacheOptions } from './adapters/git/repoCache'
import { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'
import { createAgentSandbox, type AgentSandboxOptions } from './adapters/agentSandbox/agentSandbox'

/** What the app passes in: paths, target repository, token and optional overrides of the defaults. */
export interface EngineConfig {
  /** SQLite file; parent directories are created. */
  dbPath: string
  /** `packages/core/drizzle` */
  migrationsFolder: string
  /** `packages/core/skills` */
  skillsDir: string
  /** `packages/core/hooks` — guard and audit scripts for the agent (spec §13). */
  hooksDir: string
  /** Directory with the ticket files (`examples/tickets`). */
  ticketsDir: string
  /** Repository root; ticket source paths are shown relative to it. */
  rootDir: string
  /** Target repository on GitHub (`TARGET_REPO`). */
  targetRepo: string
  /** Fine-grained PAT (`GITHUB_TOKEN`); without it stages cannot be started. */
  githubToken?: string
  /** Branch the app works on; default `SHOWCASE_BRANCH`. */
  baseBranch?: string
  /** Tag the repo reset moves the base branch back to; default `BASELINE_TAG`. */
  baselineTag?: string
  /** Maximum runtime of one Claude call in ms (`REFINEMENT_TIMEOUT_MS`); default `DEFAULT_AGENT_TIMEOUT_MS`. */
  agentTimeoutMs?: number
  /** Root of the clone cache (`REPO_CACHE_DIR`); default `$TMPDIR/repo-cache`. */
  repoCacheDir?: string
}

const STOP_SETTLE_MS = 500
/** Maximum runtime of one Claude call unless `agentTimeoutMs` is set: 10 minutes. */
export const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000

/** Branch the app works on; PRs target it, `master` stays untouched (spec §12). */
export const SHOWCASE_BRANCH = 'showcase'
/** Tag marking the initial state of the showcase branch; the repo reset moves the branch back to it. */
export const BASELINE_TAG = 'showcase-base'

/**
 * Paths of the assets shipped with this package. Passed in from the app because bundlers
 * (Next.js) relocate the code, so `__dirname` inside the package is not reliable.
 * @param coreDir - Absolute path to `packages/core`.
 */
export function resolveCorePaths(coreDir: string): Pick<EngineConfig, 'migrationsFolder' | 'skillsDir' | 'hooksDir'> {
  return {
    migrationsFolder: path.join(coreDir, 'drizzle'),
    skillsDir: path.join(coreDir, 'skills'),
    hooksDir: path.join(coreDir, 'hooks'),
  }
}

/** Starts agent work detached from the request; a failure that escapes the use case is only logged. */
function runInBackground(task: Promise<void>): void {
  task.catch((err) => console.error('[background] unhandled error in agent run', err))
}

/**
 * Composition root of the core: builds every production adapter, wires them into the use cases and returns the
 * engine the app talks to. This is the only place that knows the concrete adapters; everything else sees ports.
 *
 * Wiring:
 * - **Sandbox** (`agentSandbox`): one instance shared by every `claude` process — the stage agents (claudeCli) and
 *   the codebase summary (git) — so no agent runs without the guard/audit hooks.
 * - **Database** (SQLite/Drizzle): opened at `dbPath`, migrations applied; tickets, runs, artifacts and the audit
 *   log share this one connection.
 * - **Ticket source** (`examples/tickets/*.md`): the simulated Jira; read by `startup`.
 * - **Code host** (GitHub): only with `githubToken`; without it `codeHost` is null, the app still shows tickets but
 *   stages cannot be started.
 * - **Agent runner** (Claude CLI) and **repo provider** (git clone in `repoCacheDir`, checkout of `baseBranch`).
 * - **Events** (in-process bus) for the SSE route; **runInBackground** runs agent work detached from the request.
 *
 * Defaults for the optional fields: `baseBranch` = `SHOWCASE_BRANCH`, `baselineTag` = `BASELINE_TAG`,
 * `agentTimeoutMs` = `DEFAULT_AGENT_TIMEOUT_MS`, `repoCacheDir` = `$TMPDIR/repo-cache`.
 *
 * Side effects: creates the database file (and its folder) and applies migrations. It does not touch GitHub or
 * the tickets — call `startup()` on the result for that.
 *
 * Call once per process and keep the result (the web app keeps it on `globalThis`, see `apps/web/lib/container.ts`):
 * a second engine would open a second connection, bus and reset flag.
 *
 * @param config - Paths, target repository, token and optional overrides; see `EngineConfig`.
 * @returns The use cases (`UseCases`) — the only API of the core.
 * @throws If `config.targetRepo` is not a GitHub repository URL (checked first, with or without token), or if a
 *   database migration fails.
 */
export function createRefinementEngine(config: EngineConfig): UseCases {
  // Fail at start with the clear message, with or without token.
  parseGitHubRepoUrl(config.targetRepo)
  const { baseBranch = SHOWCASE_BRANCH, baselineTag = BASELINE_TAG, agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS } = config

  // One sandbox for every `claude` process: user settings only, guard/audit hooks, read tools, clean env (spec §13).
  const sandboxOptions: AgentSandboxOptions = { hooksDir: config.hooksDir }
  const sandbox = createAgentSandbox(sandboxOptions)

  const databaseOptions: SqliteDatabaseOptions = { path: config.dbPath, migrationsFolder: config.migrationsFolder }
  const db = createSqliteDatabase(databaseOptions)

  const ticketSourceOptions: MarkdownTicketSourceOptions = { dir: config.ticketsDir, rootDir: config.rootDir }
  const agentRunnerOptions: ClaudeCliOptions = { skillsDir: config.skillsDir, sandbox, timeoutMs: agentTimeoutMs }
  const repoCacheOptions: RepoCacheOptions = {
    cacheDir: config.repoCacheDir ?? path.join(os.tmpdir(), 'repo-cache'),
    sandbox,
    baseBranch,
  }

  const deps: UseCaseDeps = {
    tickets: createSqliteTicketRepository(db),
    runs: createSqliteAgentRunRepository(db),
    artifacts: createSqliteArtifactRepository(db),
    audit: createSqliteAuditLog(db),
    source: createMarkdownTicketSource(ticketSourceOptions),
    codeHost: createCodeHost(config, baseBranch, baselineTag),
    agent: createClaudeCliAgentRunner(agentRunnerOptions),
    repos: createGitRepoProvider(repoCacheOptions),
    events: createNodeEventPublisher(),
    repoUrl: config.targetRepo,
    baseBranch,
    baselineTag,
    runInBackground,
    stopSettleMs: STOP_SETTLE_MS,
    resetState: { resetting: false },
  }
  return createUseCases(deps)
}

/** GitHub adapter for the target repository; null without a token, so stages cannot be started. */
function createCodeHost(config: EngineConfig, baseBranch: string, baselineTag: string): CodeHost | null {
  if (!config.githubToken) {
    return null
  }
  const codeHostOptions: GitHubCodeHostOptions = {
    repoUrl: config.targetRepo,
    token: config.githubToken,
    baseBranch,
    baselineTag,
  }
  return createGitHubCodeHost(codeHostOptions)
}
