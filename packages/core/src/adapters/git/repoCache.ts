import crypto from 'crypto'
import path from 'path'
import { execFileSync } from 'child_process'
import fs from 'fs'
import type { ClaudeProcessSandbox, RepoProvider } from '../../ports'
import { ensureRepoSummary } from './codebaseSummary'

// Local clone cache of the target repository: one folder per repository URL under `cacheDir`.

const HASH_PREFIX_LENGTH = 12

/** Configuration of the git adapter, passed in by compose.ts. */
export interface RepoCacheOptions {
  /** Root of the clone cache (`REPO_CACHE_DIR`, read by the app). */
  cacheDir: string
  /** The summary run uses the same sandbox (guard and audit hooks, clean env) as the agent. */
  sandbox: ClaudeProcessSandbox
}

/**
 * Local checkout directory of the repository under the cache root.
 * The folder name is a 12-character SHA-256 prefix of the URL.
 * @param repoUrl  - The full repository URL.
 * @param cacheDir - Root of the clone cache.
 */
export function getRepoDir(repoUrl: string, cacheDir: string): string {
  const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, HASH_PREFIX_LENGTH)
  return path.join(cacheDir, hash)
}

/** Clone options: symlinks of the (untrusted) target repo are checked out as plain files holding the link target. */
const CLONE_CONFIG = ['-c', 'core.symlinks=false']

// All git calls use execFileSync with an argument array: no shell interprets the URL, so it cannot inject commands.

/** `git clone` without symlinks. */
function cloneRepo(repoUrl: string, repoDir: string): void {
  execFileSync('git', ['clone', ...CLONE_CONFIG, repoUrl, repoDir], { stdio: 'pipe' })
}

/** Removes whatever is at `repoDir` and clones the repository there from scratch. */
function freshClone(repoUrl: string, repoDir: string, cacheDir: string): void {
  fs.rmSync(repoDir, { recursive: true, force: true })
  fs.mkdirSync(cacheDir, { recursive: true })
  cloneRepo(repoUrl, repoDir)
}

/**
 * Updates an existing cache without symlinks. Caches cloned before `core.symlinks=false` may still contain
 * symlinks; dropping the index and resetting re-checks out every tracked file, so they become plain files.
 * Safe because the cache belongs to the app (no local changes to keep; untracked summaries survive).
 */
function pullWithoutSymlinks(repoUrl: string, repoDir: string): void {
  const git = (args: string[]) => execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' })
  // Strip any token an earlier version may have stored in the remote URL.
  git(['remote', 'set-url', 'origin', repoUrl])
  git(['config', 'core.symlinks', 'false'])
  git(['pull'])
  git(['rm', '-r', '-q', '--cached', '.'])
  git(['reset', '-q', '--hard'])
}

/**
 * Ensures the repository is present and up-to-date in the local cache.
 * Clones the repo on first use; runs `git pull` on subsequent calls and clones afresh if the pull fails.
 * Symlinks are always checked out as plain files, so the agent cannot follow a link out of the clone (spec §13).
 * Uses the plain URL without credentials (the target repo is public); the agent
 * must never see a write token. Caches cloned earlier with a token in the remote
 * URL are reset via `git remote set-url origin` before pulling.
 *
 * Note: uses execFileSync — blocks the event loop during network I/O.
 *
 * @param repoUrl  - The repository URL.
 * @param cacheDir - Root of the clone cache.
 * @returns The absolute path to the cached repository directory.
 * @throws If `git clone` fails (a failed pull falls back to a fresh clone).
 */
export async function ensureRepo(repoUrl: string, cacheDir: string): Promise<string> {
  const repoDir = getRepoDir(repoUrl, cacheDir)

  if (!fs.existsSync(repoDir)) {
    freshClone(repoUrl, repoDir, cacheDir)
    return repoDir
  }
  try {
    pullWithoutSymlinks(repoUrl, repoDir)
  } catch {
    // Any failed update (not a git repo after an interrupted clone, network error, diverged history, …)
    // is answered with a fresh clone; the cache has no local changes (cached summaries are regenerated).
    freshClone(repoUrl, repoDir, cacheDir)
  }
  return repoDir
}

/** RepoProvider port backed by a local git clone cache and a Claude-generated summary. */
export function createGitRepoProvider(options: RepoCacheOptions): RepoProvider {
  return {
    ensureRepo: (repoUrl) => ensureRepo(repoUrl, options.cacheDir),
    ensureSummary: (repoDir, model, onProgress) => ensureRepoSummary(repoDir, model, onProgress, options),
  }
}
