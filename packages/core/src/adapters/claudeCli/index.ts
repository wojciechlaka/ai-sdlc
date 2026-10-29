import fs from 'fs/promises'
import path from 'path'
import type { ZodType } from 'zod'
import { IntentAgentOutputSchema, type StageOutput } from '@refinement/shared'
import type {
  AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult, AgentRunCallbacks, ClaudeProcessSandbox,
} from '../../ports'
import type { ArtifactStage } from '../../domain/types'
import { SchemaValidationError } from './errors'
import { buildPrompt, type RetryContext } from './prompt'
import { openHookLog } from './hookLog'
import { spawnClaude, stopAgent } from './claudeProcess'
import { parseAndValidate } from './agentOutput'
import type { ExtractedResult, ClaudeCallResult } from './types'

const SCHEMA_ERROR_PREVIEW_CHARS = 120

interface StageAgent {
  skillFile: string
  schema: ZodType<StageOutput>
}

/**
 * Skill and output schema per stage. A stage without an entry cannot run yet
 * (see `STARTABLE_STAGES` in domain/rules).
 */
const STAGE_AGENTS: Partial<Record<ArtifactStage, StageAgent>> = {
  plan: { skillFile: 'intent-agent.md', schema: IntentAgentOutputSchema },
}

/** Skill text, output schema, sandbox and timeout of one run; the same for both of its Claude calls. */
interface LoadedAgent {
  skill: string
  schema: ZodType<StageOutput>
  sandbox: ClaudeProcessSandbox
  timeoutMs: number
}

/**
 * One `claude` call with its own hook log; schema failures are returned, all other errors are thrown.
 * Tool events are reported while the process runs; the rest is drained before the call returns.
 */
async function runClaudeOnce(
  agent: LoadedAgent,
  input: AgentRunnerInput,
  callbacks: AgentRunCallbacks,
  retryContext?: RetryContext,
): Promise<ClaudeCallResult> {
  const prompt = buildPrompt({
    skill: agent.skill,
    ticketKey: input.ticketKey,
    title: input.title,
    description: input.description,
    codebaseSummary: input.codebaseSummary,
    answeredQuestions: input.answeredQuestions,
    retryContext,
  })

  const hookLog = await openHookLog(await agent.sandbox.createLogFile(), callbacks.onToolEvent)
  let cliResult: ExtractedResult
  try {
    cliResult = await spawnClaude({
      ticketKey: input.ticketKey,
      prompt,
      cwd: input.repoDir,
      model: input.model,
      onProgress: callbacks.onProgress,
      sandbox: agent.sandbox,
      logFile: hookLog.file,
      timeoutMs: agent.timeoutMs,
    })
  } finally {
    await hookLog.close()
  }
  try {
    return { ok: true, output: parseAndValidate(cliResult.text, agent.schema), cliResult } satisfies ClaudeCallResult
  } catch (err) {
    if (err instanceof SchemaValidationError) return { ok: false, cliResult, error: err } satisfies ClaudeCallResult
    throw err
  }
}

/** Sums tokens and cost of both Claude calls so the full run cost is reported. */
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
  onProgress(`Schema-Fehler, Retry… (Output: "${preview}")`)
  onProgress(`Schema-Validierungsfehler: ${message}`)
}

/** Usage of the run: duration since `startedAt`, tokens and cost of the given Claude call(s). */
function buildMeta(model: string, startedAt: number, cliResult: ExtractedResult): AgentRunMeta {
  return {
    model,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    inputTokens: cliResult.inputTokens,
    cacheCreationTokens: cliResult.cacheCreationTokens,
    cacheReadTokens: cliResult.cacheReadTokens,
    outputTokens: cliResult.outputTokens,
    costUsd: cliResult.costUsd,
  }
}

/** Configuration of the claudeCli adapter, passed in by compose.ts. */
export interface ClaudeCliOptions {
  /** Absolute path to `packages/core/skills`. */
  skillsDir: string
  /** Settings sources, guard/audit hooks, allowed tools and environment of the `claude` process (spec §13). */
  sandbox: ClaudeProcessSandbox
  /** Maximum runtime of one Claude call (`REFINEMENT_TIMEOUT_MS`, read by the app). */
  timeoutMs: number
}

/**
 * Runs the agent of `input.stage` and returns its validated output.
 * One automatic retry on a SchemaValidationError (the retry prompt quotes the malformed output);
 * terminate, timeout and CLI errors propagate immediately. Tokens and cost cover both calls.
 * Every call runs in the sandbox (guard and audit hooks, clean env); its tool calls reach `callbacks.onToolEvent`.
 * @throws {Error} if the stage has no agent yet.
 * @throws {AgentRunTerminatedError} if the process is killed via `stopAgent`.
 * @throws {AgentRunTimeoutError} if a Claude call exceeds `options.timeoutMs`.
 * @throws {CliError} if the Claude process exits with a non-zero code.
 * @throws {SchemaValidationError} if both calls produce invalid output.
 */
export async function runAgent(
  input: AgentRunnerInput,
  callbacks: AgentRunCallbacks,
  options: ClaudeCliOptions,
): Promise<AgentRunResult> {
  const stageAgent = STAGE_AGENTS[input.stage]
  // German: failStage shows this message on the ticket page.
  if (!stageAgent) throw new Error(`Für die Stufe ${input.stage} gibt es noch keinen Agent`)
  const agent: LoadedAgent = {
    skill: await fs.readFile(path.join(/*turbopackIgnore: true*/ options.skillsDir, stageAgent.skillFile), 'utf-8'),
    schema: stageAgent.schema,
    sandbox: options.sandbox,
    timeoutMs: options.timeoutMs,
  }
  const startedAt = Date.now()

  const first = await runClaudeOnce(agent, input, callbacks)
  if (first.ok) return { output: first.output, meta: buildMeta(input.model, startedAt, first.cliResult) }

  reportSchemaError(first.error.rawOutput, first.error.message, callbacks.onProgress)
  const retry = await runClaudeOnce(agent, input, callbacks, {
    previousOutput: first.error.rawOutput ?? first.error.message,
    reason: first.error.reason,
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
