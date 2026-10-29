import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import fsPromises from 'fs/promises'
import type { RepoProvider } from '../../ports'

// Configurable via env var; falls back to the OS temp directory.
const CACHE_ROOT = process.env.REPO_CACHE_DIR ?? path.join(os.tmpdir(), 'repo-cache')

const HASH_PREFIX_LENGTH = 12
// Same values as in adapters/claudeCli (errors.ts, hookLog.ts); adapters must not import each other
// (architecture test), so each keeps its own copy.
const STDERR_PREVIEW_CHARS = 200
const HOOK_LOG_DIR_PREFIX = 'refinement-hooks-'
const HOOK_LOG_FILE_NAME = 'tools.jsonl'

/** Sandbox of the `claude` processes (built in compose.ts by `adapters/agentSandbox`, spec §13). */
export interface SummarySandbox {
  /** Flags for settings sources, hooks and allowed tools. */
  readonly args: readonly string[]
  /** Environment of one process whose hooks write to `logFile`. */
  env(logFile: string): NodeJS.ProcessEnv
}

export interface RepoCacheOptions {
  /** The summary run uses the same sandbox (guard and audit hooks, clean env) as the agent. */
  sandbox: SummarySandbox
}

// Headings are German because the summary is pasted verbatim into the agent's German prompt.
const SUMMARY_PROMPT = `Analyze this codebase and produce a structured overview in Markdown.

## Technologie-Stack
List the main languages, frameworks, and libraries.

## Verzeichnisstruktur
Show the top-level directory layout and the purpose of each directory.

## Schlüssel-Module
For each important module:
- **Zweck:** What it does
- **Schlüsseldateien:** The most important files
- **Öffentliche Schnittstellen:** Key exported functions, classes, or types

## Patterns & Konventionen
Naming conventions, architectural patterns, code style decisions.

## Wo man was findet
Where to add a new API endpoint, component, model, etc.

Be concise. Focus on what a developer needs to quickly understand the codebase.`

/**
 * Local checkout directory of the repository under the cache root.
 * The folder name is a 12-character SHA-256 prefix of the URL.
 * @param repoUrl - The full repository URL.
 */
export function getRepoDir(repoUrl: string): string {
  const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, HASH_PREFIX_LENGTH)
  return path.join(CACHE_ROOT, hash)
}

/** Clone options: symlinks of the (untrusted) target repo are checked out as plain files holding the link target. */
const CLONE_CONFIG = ['-c', 'core.symlinks=false']

// All git calls use execFileSync with an argument array: no shell interprets the URL, so it cannot inject commands.

/** `git clone` without symlinks. */
function cloneRepo(repoUrl: string, repoDir: string): void {
  execFileSync('git', ['clone', ...CLONE_CONFIG, repoUrl, repoDir], { stdio: 'pipe' })
}

/** Removes whatever is at `repoDir` and clones the repository there from scratch. */
function freshClone(repoUrl: string, repoDir: string): void {
  fs.rmSync(repoDir, { recursive: true, force: true })
  fs.mkdirSync(CACHE_ROOT, { recursive: true })
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
 * Clones the repo on first use; runs `git pull` on subsequent calls and clones afresh if the pull fails. Symlinks are always checked out as plain
 * files, so the agent cannot follow a link out of the clone (spec §13).
 * Uses the plain URL without credentials (the target repo is public); the agent
 * must never see a write token. Caches cloned earlier with a token in the remote
 * URL are reset via `git remote set-url origin` before pulling.
 *
 * Note: uses execFileSync — blocks the event loop during network I/O.
 *
 * @param repoUrl - The repository URL.
 * @returns The absolute path to the cached repository directory.
 * @throws If `git clone` fails (a failed pull falls back to a fresh clone).
 */
export async function ensureRepo(repoUrl: string): Promise<string> {
  const repoDir = getRepoDir(repoUrl)

  if (!fs.existsSync(repoDir)) {
    freshClone(repoUrl, repoDir)
    return repoDir
  }
  try {
    pullWithoutSymlinks(repoUrl, repoDir)
  } catch {
    // Any failed update (not a git repo after an interrupted clone, network error, diverged history, …)
    // is answered with a fresh clone; the cache has no local changes (cached summaries are regenerated).
    freshClone(repoUrl, repoDir)
  }
  return repoDir
}

/**
 * Returns the current HEAD commit hash of the cached repository.
 * @param repoDir - Absolute path to the cloned repository directory.
 */
export function getCommitHash(repoDir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, stdio: 'pipe' })
    .toString()
    .trim()
}

// Deduplicates concurrent calls for the same summary path — both callers await the same job.
const inFlight = new Map<string, Promise<string | null>>()

/** The summary run has no ticket: blocked tool calls only go to the server log. */
async function warnBlockedCalls(logFile: string): Promise<void> {
  const content = await fsPromises.readFile(logFile, 'utf-8').catch(() => '')
  for (const line of content.split('\n')) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>
      if (entry.kind === 'blocked') console.warn(`[repoCache] Blocked: ${entry.tool} ${entry.target} — ${entry.reason}`)
    } catch { /* empty or partial line */ }
  }
}

/**
 * Generates a codebase summary by spawning a Claude process, writes it to disk,
 * and removes the in-flight entry when done. Returns null on any failure.
 * @param summaryPath - Absolute path where the generated summary will be written.
 * @param repoDir     - Working directory for the Claude process (cloned repository).
 * @param model       - Claude model identifier used for generation.
 * @param onProgress  - Receives status messages during generation.
 */
async function generateAndCache(
  summaryPath: string,
  repoDir: string,
  model: string,
  onProgress: (msg: string) => void,
  options: RepoCacheOptions,
): Promise<string | null> {
  try {
    onProgress(`Codebase wird analysiert (einmalig für das Modell: ${model})…`)
    const summary = await runSummaryJob(repoDir, model, options)
    await fsPromises.writeFile(summaryPath, summary)
    onProgress('Codebase-Analyse abgeschlossen.')
    return summary
  } catch (err) {
    console.warn(`[repoCache] summary generation failed, continuing without summary: ${err}`)
    return null
  } finally {
    inFlight.delete(summaryPath)
  }
}

/**
 * Ensures a Claude-generated codebase summary exists for the current git commit and model.
 * Returns the cached file immediately on a local cache hit.
 * Deduplicates concurrent generation requests for the same summary via an in-flight map.
 * Returns null without throwing if generation fails for any reason.
 * @param repoDir    - Absolute path to the cloned repository directory.
 * @param model      - Claude model used to generate the summary.
 * @param onProgress - Receives status messages during generation (silent on cache hit).
 * @param options    - Sandbox of the summary run.
 */
export async function ensureRepoSummary(
  repoDir: string,
  model: string,
  onProgress: (msg: string) => void,
  options: RepoCacheOptions,
): Promise<string | null> {
  try {
    const hash = getCommitHash(repoDir)
    const summaryPath = path.join(repoDir, `codebase-summary-${hash}-${model}.md`)

    const cached = await fsPromises.readFile(summaryPath, 'utf-8').catch(() => null)
    if (cached) {
      onProgress(`Codebase-Analyse geladen (${model}).`)
      return cached
    }

    const existing = inFlight.get(summaryPath)
    if (existing) return existing

    const job = generateAndCache(summaryPath, repoDir, model, onProgress, options)
    inFlight.set(summaryPath, job)
    return job
  } catch (err) {
    console.warn(`[repoCache] ensureRepoSummary failed, continuing without summary: ${err}`)
    return null
  }
}

/**
 * Scans Claude's stream-JSON output for a `result` line with `subtype: "success"`
 * and returns its `result` field.
 * @param raw - Full stdout of the Claude CLI process.
 * @throws If no success result line is found.
 */
function extractStreamJsonResult(raw: string): string {
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      if (obj.type === 'result' && obj.subtype === 'success') {
        return (obj.result as string) ?? ''
      }
    } catch {
      // not a JSON line
    }
  }
  throw new Error('No success result found in claude stream-json output')
}

/**
 * Spawns a Claude CLI process with the codebase summary prompt and returns the
 * generated Markdown text. Delivers the prompt via stdin; parses stream-JSON stdout.
 * Runs in the sandbox (guard and audit hooks, clean env); blocked calls are logged as warnings afterwards.
 * @param cwd     - Working directory for the Claude process (cloned repository).
 * @param model   - Claude model identifier to use for generation.
 * @param options - Sandbox of the process.
 * @throws If the Claude process exits with a non-zero code or no success result is found.
 */
async function runSummaryJob(cwd: string, model: string, options: RepoCacheOptions): Promise<string> {
  const logDir = await fsPromises.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), HOOK_LOG_DIR_PREFIX))
  const logFile = path.join(/*turbopackIgnore: true*/ logDir, HOOK_LOG_FILE_NAME)
  try {
    return await spawnSummary(cwd, model, options.sandbox, logFile)
  } finally {
    await warnBlockedCalls(logFile)
    await fsPromises.rm(logDir, { recursive: true, force: true })
  }
}

function spawnSummary(cwd: string, model: string, sandbox: SummarySandbox, logFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      ...sandbox.args,
    ], {
      cwd,
      env: sandbox.env(logFile),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.on('error', reject)

    // Suppress EPIPE — Claude may exit before consuming all of stdin.
    proc.stdin.on('error', () => {})
    proc.stdin.write(SUMMARY_PROMPT)
    proc.stdin.end()

    let output = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve(extractStreamJsonResult(output))
      else reject(new Error(`claude summary exited with code ${code}\nstderr: ${stderr.slice(0, STDERR_PREVIEW_CHARS)}`))
    })
  })
}

/** RepoProvider port backed by a local git clone cache and a Claude-generated summary. */
export function createGitRepoProvider(options: RepoCacheOptions): RepoProvider {
  return {
    ensureRepo,
    ensureSummary: (repoDir, model, onProgress) => ensureRepoSummary(repoDir, model, onProgress, options),
  }
}
