import { spawn, ChildProcess } from 'child_process'
import fs from 'fs/promises'
import { AgentOutputSchema } from '@refinement/shared'
import type { AgentOutput } from '@refinement/shared'
import { SchemaValidationError, CliError } from './errors'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../../ports'
import type { AgentRunner } from '../../ports'
import { buildPrompt } from './prompt'
import type { PromptInput } from './prompt'
import type {
  ClaudeStreamMessage,
  ClaudeTokenUsage,
  ExtractedResult,
  AttemptResult,
  RefinementInput,
  RefinementMeta,
  RefinementResult,
} from './types'
export type { RefinementInput, RefinementMeta, RefinementResult } from './types'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const SIGTERM_EXIT_CODE = 143
const ALLOWED_TOOLS = 'Read,LS,Bash'
const MS_PER_SECOND = 1000
const UTF8 = 'utf-8' as const

const runningProcesses = new Map<string, ChildProcess>()

const SCHEMA_ERROR_PREVIEW_CHARS = 120
const MARKDOWN_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/

const TOOL_PROGRESS_MESSAGE: Record<string, string> = {
  Read: 'Codebase wird analysiert...',
  LS:   'Codebase wird analysiert...',
  Bash: 'Codebase wird analysiert...',
}

/**
 * Interprets the Claude process exit code and returns the extracted result, or throws an appropriate error.
 * @param code   - Process exit code, or null if the process was killed.
 * @param output - Full stdout of the Claude process.
 * @param stderr - Full stderr of the Claude process, included in CliError on non-zero exit.
 */
function parseProcessExit(code: number | null, output: string, stderr: string): ExtractedResult {
  if (code === SIGTERM_EXIT_CODE || code === null) throw new AgentRunTerminatedError()
  if (code !== 0) throw new CliError(code, stderr)
  return extractResult(output)
}

/**
 * Parses one stream-JSON line and emits a progress message if a new tool_use block is detected.
 * Returns the (possibly updated) last progress message to avoid emitting duplicates.
 * @param line            - A single line from the Claude stream-JSON stdout.
 * @param lastProgressMsg - The last progress message emitted, used for deduplication.
 * @param onProgress      - Callback to emit a new progress message.
 */
function handleLine(line: string, lastProgressMsg: string, onProgress: (msg: string) => void): string {
  const trimmed = line.trim()
  if (!trimmed) return lastProgressMsg
  try {
    const ev = JSON.parse(trimmed) as Record<string, unknown>
    if (ev.type !== 'assistant') return lastProgressMsg
    const content = (ev.message as ClaudeStreamMessage)?.content ?? []
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const msg = TOOL_PROGRESS_MESSAGE[block.name as string]
      if (msg && msg !== lastProgressMsg) { lastProgressMsg = msg; onProgress(msg) }
    }
  } catch { /* incomplete line */ }
  return lastProgressMsg
}

/**
 * Sends SIGTERM to the running Claude process for the given ticket ID. Returns false if no process is running.
 * @param ticketId - The public ticket ID string (e.g. `T-42`).
 */
export function stopRefinement(ticketId: string): boolean {
  const proc = runningProcesses.get(ticketId)
  if (!proc) return false
  runningProcesses.delete(ticketId)
  proc.kill('SIGTERM')
  return true
}

/**
 * Spawns the Claude CLI process, pipes the prompt via stdin, and streams stdout line-by-line for progress events.
 * Resolves with the raw CLI result; rejects with AgentRunTimeoutError, AgentRunTerminatedError, or CliError.
 * @param ticketId   - Used to register the process in `runningProcesses` for cancellation.
 * @param prompt     - The full prompt string to send via stdin.
 * @param cwd        - Working directory for the Claude process (cloned repository).
 * @param model      - Claude model identifier.
 * @param onProgress - Callback for progress messages parsed from the stream.
 */
async function spawnClaude(
  ticketId: string,
  prompt: string,
  cwd: string,
  model: string,
  onProgress: (msg: string) => void,
): Promise<ExtractedResult> {
  const parsedTimeout = parseInt(process.env['REFINEMENT_TIMEOUT_MS'] ?? '', 10)
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS

  return new Promise<ExtractedResult>((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--allowedTools', ALLOWED_TOOLS,
    ], { cwd, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] })

    runningProcesses.set(ticketId, proc)

    const cleanup = () => { runningProcesses.delete(ticketId) }

    let stderrBuf = ''

    const timer = setTimeout(() => {
      cleanup()
      proc.kill('SIGTERM')
      settle(() => reject(new AgentRunTimeoutError(timeoutMs)))
    }, timeoutMs)

    proc.stdin.write(prompt)
    proc.stdin.end()

    let output = ''
    let stdoutBuf = ''
    let lastProgressMsg = ''

    proc.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString()
      output += chunk
      stdoutBuf += chunk
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) lastProgressMsg = handleLine(line, lastProgressMsg, onProgress)
    })

    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      settle(() => {
        try { resolve(parseProcessExit(code, output, stderrBuf)) }
        catch (e) { reject(e as Error) }
      })
    })
  })
}

/**
 * Scans the Claude stream-JSON stdout for the `result` success line and maps it to an ExtractedResult.
 * Throws CliError if no success line is found.
 * @param raw - Full stdout of the Claude CLI process.
 */
function extractResult(raw: string): ExtractedResult {
  for (const line of raw.split('\n')) {
    try {
      const obj = JSON.parse(line.trim()) as Record<string, unknown>
      if (obj.type === 'result' && obj.subtype === 'success') {
        const usage = obj.usage as ClaudeTokenUsage | undefined
        return {
          text: (obj.result as string) ?? '',
          inputTokens: usage?.input_tokens ?? 0,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          costUsd: typeof obj.cost_usd === 'number' ? obj.cost_usd : 0,
        } satisfies ExtractedResult
      }
    } catch { /* skip */ }
  }
  throw new CliError(-1, 'No success result in stream-json output')
}

/**
 * Extracts the JSON object from the agent's raw text output.
 * Strips markdown fences if present, otherwise falls back to the firstAttempt `{...}` substring.
 * @param raw - The agent's raw text output.
 */
function extractJsonString(raw: string): string {
  const s = raw.trim()
  const fenceMatch = s.match(MARKDOWN_CODE_BLOCK_RE)
  if (fenceMatch) return fenceMatch[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) return s.slice(start, end + 1)
  return s
}

/**
 * Parses and Zod-validates the agent's raw text output.
 * Throws SchemaValidationError if the text is not valid JSON or does not match AgentOutputSchema.
 * @param raw - The agent's raw text output.
 */
function parseAndValidate(raw: string): AgentOutput {
  const json = extractJsonString(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new SchemaValidationError(
      [{ message: 'Agent output is not valid JSON', path: [], code: 'custom', input: undefined }] as import('zod').ZodIssue[],
      raw,
    )
  }
  const result = AgentOutputSchema.safeParse(parsed)
  if (!result.success) throw new SchemaValidationError(result.error.issues, raw)
  return result.data
}

/**
 * Runs a single Claude attempt (initial or retryAttempt) and returns a typed result indicating success or schema failure.
 * @param skill        - The skill file content to include in the prompt.
 * @param input        - The refinement input parameters.
 * @param onProgress   - Callback for progress messages during the run.
 * @param retryContext - If set, builds a correction prompt with the previous malformed output.
 */
async function runAttempt(
  skill: string,
  input: RefinementInput,
  onProgress: (msg: string) => void,
  retryContext?: { previousOutput: string; schemaError: string },
): Promise<AttemptResult> {
  const promptInput: PromptInput = {
    skill,
    ticketId: input.ticketId,
    title: input.title,
    description: input.description,
    acceptanceCriteria: input.acceptanceCriteria,
    codebaseSummary: retryContext ? undefined : input.codebaseSummary,
    summary: retryContext ? undefined : input.feedback,
    previousRuns: input.previousRuns,
    retryContext,
  }
  const prompt = buildPrompt(promptInput)

  const cliResult = await spawnClaude(input.ticketId, prompt, input.repoPath, input.model, onProgress)
  try {
    return { ok: true, output: parseAndValidate(cliResult.text), cliResult } satisfies AttemptResult
  } catch (err) {
    if (err instanceof SchemaValidationError) return { ok: false, cliResult, error: err } satisfies AttemptResult
    throw err
  }
}

/**
 * Combines two CLI results into one by summing all token counts and costs.
 * Used when a retryAttempt occurs so the full run cost is reported correctly.
 * @param firstAttempt - Result from the firstAttempt (failed) attempt.
 * @param retryAttempt - Result from the retryAttempt attempt.
 */
function aggregateCliResults(firstAttempt: ExtractedResult, retryAttempt: ExtractedResult): ExtractedResult {
  return {
    text: retryAttempt.text,
    inputTokens: firstAttempt.inputTokens + retryAttempt.inputTokens,
    cacheCreationTokens: firstAttempt.cacheCreationTokens + retryAttempt.cacheCreationTokens,
    cacheReadTokens: firstAttempt.cacheReadTokens + retryAttempt.cacheReadTokens,
    outputTokens: firstAttempt.outputTokens + retryAttempt.outputTokens,
    costUsd: firstAttempt.costUsd + retryAttempt.costUsd,
  }
}

/**
 * Emits two progress messages before the retry attempt: a preview of the malformed output
 * and the schema validation error message.
 * @param rawOutput  - The agent's raw (malformed) output, used for the preview snippet.
 * @param message    - The schema validation error message.
 * @param onProgress - Callback to emit progress messages.
 */
function reportSchemaError(rawOutput: string | undefined, message: string, onProgress: (msg: string) => void): void {
  const preview = (rawOutput ?? '').slice(0, SCHEMA_ERROR_PREVIEW_CHARS).replace(/\n/g, ' ')
  onProgress(`Schema-Fehler, Retry... (Output: "${preview}")`)
  onProgress(`Schema-Validierungsfehler: ${message}`)
}

/**
 * Builds a RefinementMeta from the CLI result and elapsed time since `startedAt`.
 * @param model     - The Claude model identifier.
 * @param startedAt - Unix timestamp (ms) when the run began.
 * @param cliResult - Raw result from the Claude CLI process.
 */
function buildMeta(model: string, startedAt: number, cliResult: ExtractedResult): RefinementMeta {
  return {
    model,
    durationSeconds: Math.round((Date.now() - startedAt) / MS_PER_SECOND),
    inputTokens: cliResult.inputTokens,
    cacheCreationTokens: cliResult.cacheCreationTokens,
    cacheReadTokens: cliResult.cacheReadTokens,
    outputTokens: cliResult.outputTokens,
    costUsd: cliResult.costUsd,
  }
}

export interface ClaudeCliOptions {
  /** Absolute path to `packages/core/skills/refinement-agent.md`. */
  skillPath: string
}

/**
 * Spawns the Claude CLI with a refinement prompt and returns the validated agent output.
 * Performs one automatic retry if the first attempt produces a `SchemaValidationError`
 * (invalid JSON or Zod schema mismatch). The retry prompt includes the malformed output
 * and the validation error so Claude can self-correct.
 * Hard errors (`AgentRunTerminatedError`, `AgentRunTimeoutError`, `CliError`) bypass the retry and propagate immediately.
 * Token counts and cost are aggregated across both attempts when a retry occurs.
 * @param input      - Ticket data, repo path, model, and optional Q&A history.
 * @param onProgress - Callback for progress messages emitted during the run.
 * @throws {AgentRunTerminatedError} if the process is killed via `stopRefinement`.
 * @throws {AgentRunTimeoutError} if the run exceeds `REFINEMENT_TIMEOUT_MS`.
 * @throws {CliError} if the Claude process exits with a non-zero code.
 * @throws {SchemaValidationError} if both attempts produce invalid output.
 */
export async function runRefinement(
  input: RefinementInput,
  onProgress: (msg: string) => void,
  options: ClaudeCliOptions,
): Promise<RefinementResult> {
  const skill = await fs.readFile(options.skillPath, UTF8)
  const startedAt = Date.now()

  // 1  make frist attempt
  const firstAttempt = await runAttempt(skill, input, onProgress)
  if (firstAttempt.ok) {
    return { output: firstAttempt.output, meta: buildMeta(input.model, startedAt, firstAttempt.cliResult) }
  }

  // 2. report errors
  const firstAttemptErrorMessage = firstAttempt.error.message
  const firstAttemptErrorRawOutput = firstAttempt.error.rawOutput

  reportSchemaError(firstAttemptErrorRawOutput, firstAttemptErrorMessage, onProgress)

  // 3 make retryAttempt
  const retryAttempt = await runAttempt(skill, input, onProgress, {
    previousOutput: firstAttemptErrorRawOutput ?? firstAttemptErrorMessage,
    schemaError: firstAttemptErrorMessage,
  })

  if (!retryAttempt.ok) throw retryAttempt.error

  // 4. aggregateCliResults
  const cliResult = aggregateCliResults(firstAttempt.cliResult, retryAttempt.cliResult)
  return { output: retryAttempt.output, meta: buildMeta(input.model, startedAt, cliResult) }
}

/** AgentRunner port backed by the headless Claude Code CLI (`claude --print`). */
export function createClaudeCliAgentRunner(options: ClaudeCliOptions): AgentRunner {
  return {
    run: (input, onProgress) => runRefinement(input, onProgress, options),
    stop: (ticketId) => stopRefinement(ticketId),
  }
}
