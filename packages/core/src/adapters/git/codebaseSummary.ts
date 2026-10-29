import path from 'path'
import { execFileSync, spawn } from 'child_process'
import fsPromises from 'fs/promises'
import type { ClaudeProcessSandbox } from '../../ports'
import { describeError } from '../../domain/errors'

// Codebase summary: one sandboxed `claude` run per commit and model, cached as a Markdown file in the clone and
// pasted into the agent prompt. Failures only cost the summary — the agent then starts without it.

// Same value as in adapters/claudeCli/errors.ts; adapters must not import each other (architecture test).
const STDERR_PREVIEW_CHARS = 200

/** Configuration of the summary run. */
export interface CodebaseSummaryOptions {
  /** The summary run uses the same sandbox (guard and audit hooks, clean env) as the agent. */
  sandbox: ClaudeProcessSandbox
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
      if (entry.kind === 'blocked') {
        console.warn(`[codebaseSummary] Blocked: ${entry.tool} ${entry.target} — ${entry.reason}`)
      }
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
  options: CodebaseSummaryOptions,
): Promise<string | null> {
  try {
    onProgress(`Codebase wird analysiert (einmalig für das Modell: ${model})…`)
    const summary = await runSummaryJob(repoDir, model, options)
    await fsPromises.writeFile(summaryPath, summary)
    onProgress('Codebase-Analyse abgeschlossen.')
    return summary
  } catch (err) {
    console.warn(`[codebaseSummary] summary generation failed, continuing without summary: ${describeError(err)}`)
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
  options: CodebaseSummaryOptions,
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
    if (existing) {
      return existing
    }

    const job = generateAndCache(summaryPath, repoDir, model, onProgress, options)
    inFlight.set(summaryPath, job)
    return job
  } catch (err) {
    console.warn(`[codebaseSummary] ensureRepoSummary failed, continuing without summary: ${describeError(err)}`)
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
    if (!trimmed) {
      continue
    }
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
async function runSummaryJob(cwd: string, model: string, options: CodebaseSummaryOptions): Promise<string> {
  const logFile = await options.sandbox.createLogFile()
  try {
    return await spawnSummary(cwd, model, options.sandbox, logFile.path)
  } finally {
    await warnBlockedCalls(logFile.path)
    await logFile.cleanup()
  }
}

/** One `claude` call with the summary prompt; resolves with the result text, rejects on a non-zero exit. */
function spawnSummary(cwd: string, model: string, sandbox: ClaudeProcessSandbox, logFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', sandbox.claudeArgs(model), {
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
    proc.stdout.on('data', (d: Buffer) => {
      output += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(extractStreamJsonResult(output))
      } else {
        reject(new Error(`claude summary exited with code ${code}\nstderr: ${stderr.slice(0, STDERR_PREVIEW_CHARS)}`))
      }
    })
  })
}
