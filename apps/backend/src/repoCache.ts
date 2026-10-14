import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import fsPromises from 'fs/promises'

// Configurable via env var; falls back to the OS temp directory.
const CACHE_ROOT = process.env.REPO_CACHE_DIR ?? path.join(os.tmpdir(), 'repo-cache')

const HASH_PREFIX_LENGTH = 12
const STDERR_PREVIEW_CHARS = 200

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
 * Returns the local cache directory path for the given repository URL.
 * The path is derived from a 12-character SHA-256 hash of the URL.
 * @param repoUrl - The full repository URL.
 */
export function getRepoCacheDir(repoUrl: string): string {
  const hash = crypto.createHash('sha256').update(repoUrl).digest('hex').slice(0, HASH_PREFIX_LENGTH)
  return path.join(CACHE_ROOT, hash)
}

/**
 * Ensures the repository is present and up-to-date in the local cache.
 * Clones the repo on first use; runs `git pull` on subsequent calls.
 * Injects GITHUB_TOKEN into the URL for authentication if the env var is set.
 *
 * Note: uses execFileSync — blocks the event loop during network I/O.
 *
 * @param repoUrl - The repository URL.
 * @returns The absolute path to the cached repository directory.
 * @throws If `git clone` or `git pull` fails.
 */
export async function ensureRepo(repoUrl: string): Promise<string> {
  const cacheDir = getRepoCacheDir(repoUrl)
  const token = process.env.GITHUB_TOKEN

  const authenticatedUrl = token
    ? repoUrl.replace('https://', `https://${token}@`)
    : repoUrl

  if (fs.existsSync(cacheDir)) {
    try {
      // execFileSync avoids shell interpretation — no injection risk from the URL.
      execFileSync('git', ['pull'], { cwd: cacheDir, stdio: 'pipe' })
    } catch {
      // Directory exists but is not a valid git repo (e.g. interrupted clone).
      // Remove it and fall through to a fresh clone.
      fs.rmSync(cacheDir, { recursive: true, force: true })
      fs.mkdirSync(CACHE_ROOT, { recursive: true })
      execFileSync('git', ['clone', authenticatedUrl, cacheDir], { stdio: 'pipe' })
    }
  } else {
    fs.mkdirSync(CACHE_ROOT, { recursive: true })
    execFileSync('git', ['clone', authenticatedUrl, cacheDir], { stdio: 'pipe' })
  }

  return cacheDir
}

/**
 * Returns the current HEAD commit hash of the cached repository.
 * @param cacheDir - Absolute path to the cloned repository directory.
 */
export function getCommitHash(cacheDir: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cacheDir, stdio: 'pipe' })
    .toString()
    .trim()
}

/**
 * Ensures a Claude-generated codebase summary exists for the current git commit.
 * Returns the cached file immediately if one exists for the current HEAD hash.
 * Otherwise spawns a Claude (Haiku) process to generate and cache it.
 * Returns null without throwing if generation fails for any reason.
 * @param cacheDir   - Absolute path to the cloned repository directory.
 * @param onProgress - Receives status messages when generation runs (silent on cache hit).
 */
// Deduplicates concurrent calls for the same summary path — both callers await the same job.
const inFlight = new Map<string, Promise<string | null>>()

/**
 * Generates a codebase summary by spawning a Claude process, writes it to disk,
 * and removes the in-flight entry when done. Returns null on any failure.
 * @param summaryPath - Absolute path where the generated summary will be written.
 * @param cacheDir    - Working directory for the Claude process (cloned repository).
 * @param model       - Claude model identifier used for generation.
 * @param onProgress  - Receives status messages during generation.
 */
async function generateAndCache(
  summaryPath: string,
  cacheDir: string,
  model: string,
  onProgress: (msg: string) => void,
): Promise<string | null> {
  try {
    onProgress(`Codebase wird analysiert (einmalig für das Modell: ${model})...`)
    const summary = await runSummaryJob(cacheDir, model)
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
 * @param cacheDir   - Absolute path to the cloned repository directory.
 * @param model      - Claude model used to generate the summary.
 * @param onProgress - Receives status messages during generation (silent on cache hit).
 */
export async function ensureRepoSummary(
  cacheDir: string,
  model: string,
  onProgress: (msg: string) => void,
): Promise<string | null> {
  try {
    const hash = getCommitHash(cacheDir)
    const summaryPath = path.join(cacheDir, `codebase-summary-${hash}-${model}.md`)

    const cached = await fsPromises.readFile(summaryPath, 'utf-8').catch(() => null)
    if (cached) {
      onProgress(`Codebase-Analyse geladen (${model}).`)
      return cached
    }

    const existing = inFlight.get(summaryPath)
    if (existing) return existing

    const job = generateAndCache(summaryPath, cacheDir, model, onProgress)
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
 * @param cwd   - Working directory for the Claude process (cloned repository).
 * @param model - Claude model identifier to use for generation.
 * @throws If the Claude process exits with a non-zero code or no success result is found.
 */
async function runSummaryJob(cwd: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--allowedTools', 'Read,LS,Bash',
    ], {
      cwd,
      env: { ...process.env },
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
