import { spawn, ChildProcess } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import type { ZodIssue, ZodType } from 'zod'
import { IntentAgentOutputSchema, type StageOutput } from '@refinement/shared'
import { SchemaValidationError, CliError } from './errors'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../../ports'
import type { AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult, AgentRunCallbacks } from '../../ports'
import type { ArtifactStage } from '../../domain/types'
import { buildPrompt } from './prompt'
import { openHookLog } from './hookLog'
import type { ClaudeStreamMessage, ClaudeTokenUsage, ExtractedResult, AttemptResult } from './types'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const SIGTERM_EXIT_CODE = 143
const MS_PER_SECOND = 1000
const UTF8 = 'utf-8' as const
const SCHEMA_ERROR_PREVIEW_CHARS = 120
const MARKDOWN_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/

interface StageAgent {
  skillFile: string
  schema: ZodType<StageOutput>
}

/** Skill and output schema per stage. Part B adds `design`. */
const STAGE_AGENTS: Partial<Record<ArtifactStage, StageAgent>> = {
  plan: { skillFile: 'intent-agent.md', schema: IntentAgentOutputSchema },
}

const runningProcesses = new Map<string, ChildProcess>()

const TOOL_PROGRESS_MESSAGE: Record<string, string> = {
  Read: 'Codebase wird analysiert...',
  Glob: 'Codebase wird analysiert...',
  Grep: 'Codebase wird analysiert...',
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
 * Sends SIGTERM to the running Claude process of the ticket. Returns false if none is running.
 * @param ticketKey - e.g. `CB-2`.
 */
export function stopAgent(ticketKey: string): boolean {
  const proc = runningProcesses.get(ticketKey)
  if (!proc) return false
  runningProcesses.delete(ticketKey)
  proc.kill('SIGTERM')
  return true
}

/** Sandbox of the `claude` processes (built in compose.ts by `adapters/agentSandbox`, spec §13). */
export interface ClaudeSandbox {
  /** Flags for settings sources, hooks and allowed tools. */
  readonly args: readonly string[]
  /** Environment of one process whose hooks write to `logFile`. */
  env(logFile: string): NodeJS.ProcessEnv
}

/** Sandbox plus the hook log file of one Claude process. */
interface SandboxRun {
  sandbox: ClaudeSandbox
  logFile: string
}

/**
 * Spawns the Claude CLI, pipes the prompt via stdin and streams stdout line by line for progress events.
 * Rejects with AgentRunTimeoutError, AgentRunTerminatedError or CliError.
 */
async function spawnClaude(
  ticketKey: string,
  prompt: string,
  cwd: string,
  model: string,
  onProgress: (msg: string) => void,
  { sandbox, logFile }: SandboxRun,
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
      ...sandbox.args,
    ], { cwd, env: sandbox.env(logFile), stdio: ['pipe', 'pipe', 'pipe'] })

    runningProcesses.set(ticketKey, proc)
    const cleanup = () => { if (runningProcesses.get(ticketKey) === proc) runningProcesses.delete(ticketKey) }

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

/** Finds the `result`/`success` line of the stream-JSON output. @throws CliError if there is none. */
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
          costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : typeof obj.cost_usd === 'number' ? obj.cost_usd : 0,
        } satisfies ExtractedResult
      }
    } catch { /* skip */ }
  }
  throw new CliError(-1, 'No success result in stream-json output')
}

/** Strips a Markdown fence if present, otherwise takes the outermost `{...}`. */
function extractJsonString(raw: string): string {
  const s = raw.trim()
  const fenceMatch = s.match(MARKDOWN_CODE_BLOCK_RE)
  if (fenceMatch) return fenceMatch[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) return s.slice(start, end + 1)
  return s
}

/** Parses the agent text and validates it against the stage schema. @throws SchemaValidationError */
function parseAndValidate(raw: string, schema: ZodType<StageOutput>): StageOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonString(raw))
  } catch {
    throw new SchemaValidationError(
      [{ message: 'Agent output is not valid JSON', path: [], code: 'custom', input: undefined }] as ZodIssue[],
      raw,
    )
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new SchemaValidationError(result.error.issues, raw)
  return result.data
}

/**
 * One Claude attempt with its own hook log; schema failures are returned, all other errors are thrown.
 * Tool events are reported while the process runs; the rest is drained before the attempt returns.
 */
async function runAttempt(
  agent: { skill: string; schema: ZodType<StageOutput>; sandbox: ClaudeSandbox },
  input: AgentRunnerInput,
  callbacks: AgentRunCallbacks,
  retryContext?: { previousOutput: string; schemaError: string },
): Promise<AttemptResult> {
  const prompt = buildPrompt({
    skill: agent.skill,
    ticketKey: input.ticketKey,
    title: input.title,
    description: input.description,
    codebaseSummary: input.codebaseSummary,
    previousRuns: input.previousRuns,
    retryContext,
  })

  const hookLog = await openHookLog(callbacks.onToolEvent)
  let cliResult: ExtractedResult
  try {
    cliResult = await spawnClaude(input.ticketKey, prompt, input.repoPath, input.model, callbacks.onProgress, {
      sandbox: agent.sandbox,
      logFile: hookLog.file,
    })
  } finally {
    await hookLog.close()
  }
  try {
    return { ok: true, output: parseAndValidate(cliResult.text, agent.schema), cliResult } satisfies AttemptResult
  } catch (err) {
    if (err instanceof SchemaValidationError) return { ok: false, cliResult, error: err } satisfies AttemptResult
    throw err
  }
}

/** Sums tokens and cost of both attempts so the full run cost is reported. */
function aggregateCliResults(first: ExtractedResult, retry: ExtractedResult): ExtractedResult {
  return {
    text: retry.text,
    inputTokens: first.inputTokens + retry.inputTokens,
    cacheCreationTokens: first.cacheCreationTokens + retry.cacheCreationTokens,
    cacheReadTokens: first.cacheReadTokens + retry.cacheReadTokens,
    outputTokens: first.outputTokens + retry.outputTokens,
    costUsd: first.costUsd + retry.costUsd,
  }
}

/** Progress messages before the retry: preview of the malformed output and the validation error. */
function reportSchemaError(rawOutput: string | undefined, message: string, onProgress: (msg: string) => void): void {
  const preview = (rawOutput ?? '').slice(0, SCHEMA_ERROR_PREVIEW_CHARS).replace(/\n/g, ' ')
  onProgress(`Schema-Fehler, Retry... (Output: "${preview}")`)
  onProgress(`Schema-Validierungsfehler: ${message}`)
}

function buildMeta(model: string, startedAt: number, cliResult: ExtractedResult): AgentRunMeta {
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
  /** Absolute path to `packages/core/skills`. */
  skillsDir: string
  /** Settings sources, guard/audit hooks, allowed tools and environment of the `claude` process (spec §13). */
  sandbox: ClaudeSandbox
}

/**
 * Runs the agent of `input.stage` and returns its validated output.
 * One automatic retry on a SchemaValidationError (the retry prompt quotes the malformed output);
 * terminate, timeout and CLI errors propagate immediately. Tokens and cost cover both attempts.
 * Every attempt runs in the sandbox (guard and audit hooks, clean env); its tool calls reach `callbacks.onToolEvent`.
 * @throws {Error} if the stage has no agent yet.
 * @throws {AgentRunTerminatedError} if the process is killed via `stopAgent`.
 * @throws {AgentRunTimeoutError} if the run exceeds `REFINEMENT_TIMEOUT_MS`.
 * @throws {CliError} if the Claude process exits with a non-zero code.
 * @throws {SchemaValidationError} if both attempts produce invalid output.
 */
export async function runAgent(
  input: AgentRunnerInput,
  callbacks: AgentRunCallbacks,
  options: ClaudeCliOptions,
): Promise<AgentRunResult> {
  const stageAgent = STAGE_AGENTS[input.stage]
  if (!stageAgent) throw new Error(`Für die Stufe ${input.stage} gibt es noch keinen Agent`)
  const agent = {
    skill: await fs.readFile(path.join(/*turbopackIgnore: true*/ options.skillsDir, stageAgent.skillFile), UTF8),
    schema: stageAgent.schema,
    sandbox: options.sandbox,
  }
  const startedAt = Date.now()

  const first = await runAttempt(agent, input, callbacks)
  if (first.ok) return { output: first.output, meta: buildMeta(input.model, startedAt, first.cliResult) }

  reportSchemaError(first.error.rawOutput, first.error.message, callbacks.onProgress)
  const retry = await runAttempt(agent, input, callbacks, {
    previousOutput: first.error.rawOutput ?? first.error.message,
    schemaError: first.error.message,
  })
  if (!retry.ok) throw retry.error

  return { output: retry.output, meta: buildMeta(input.model, startedAt, aggregateCliResults(first.cliResult, retry.cliResult)) }
}

/** AgentRunner port backed by the headless Claude Code CLI (`claude --print`). */
export function createClaudeCliAgentRunner(options: ClaudeCliOptions): AgentRunner {
  return {
    run: (input, callbacks) => runAgent(input, callbacks, options),
    stop: (ticketKey) => stopAgent(ticketKey),
  }
}
