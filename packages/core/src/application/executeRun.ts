import type { StageOutput } from '@refinement/shared'
import type { Ticket } from '../domain/types'
import { renderIntent } from '../domain/render'
import { describeError } from '../domain/errors'
import {
  AgentRunTerminatedError, AgentRunTimeoutError, type AgentRunMeta, type AgentRunnerInput, type RunCompletion,
  type ToolEvent,
} from '../ports'
import type { UseCaseDeps } from './deps'
import { finishRun, isCurrentRun, type RunRequest } from './runLifecycle'
import { createReporter, type Reporter } from './reporter'
import { failStage } from './failStage'
import { publishArtifact } from './publishArtifact'
import { record } from './auditTrail'

/** RunRequest plus what `runStage` prepared: the run id, the checkout and the codebase summary. */
export interface ExecuteRunRequest extends RunRequest {
  /** The attempt's run, created by `beginRun`. */
  runId: string
  repoDir: string
  codebaseSummary: string | null
}

/** What one step of an attempt needs: deps, the ticket and its reporter, the request and the staleness check. */
interface Attempt {
  deps: UseCaseDeps
  ticket: Ticket
  reporter: Reporter
  request: ExecuteRunRequest
  /** True while this attempt is the ticket's current run (see `isCurrentRun`). */
  isCurrent: () => boolean
}

/**
 * Executes the agent for the attempt's run and applies its outcome: question → `awaiting_answer`,
 * intent → branch + PR → `in_review`. Never throws.
 * A stop, restart or reset makes the attempt stale while the agent may still answer; such late results are discarded.
 */
export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const isCurrent = () => isCurrentRun(deps, ticket.key, request.runId)
  const attempt: Attempt = { deps, ticket, reporter, request, isCurrent }

  try {
    const { output, meta } = await deps.agent.run(agentInput(ticket, request), {
      onProgress: reporter.logAndProgress,
      onToolEvent: toolEventRecorder(deps, ticket.key, reporter, isCurrent),
    })
    if (!isCurrent()) {
      discardStaleResult(attempt, meta)
      return
    }
    recordSucceededRun(attempt, output, meta)
    await applyOutput(attempt, output)
  } catch (err) {
    handleRunFailure(attempt, err)
  }
}

/** What the agent gets: ticket text, checkout, model, summary and the Q&A history. */
function agentInput(ticket: Ticket, request: ExecuteRunRequest): AgentRunnerInput {
  return {
    ticketKey: ticket.key,
    stage: request.stage,
    title: ticket.title,
    description: ticket.description,
    repoDir: request.repoDir,
    model: request.model,
    codebaseSummary: request.codebaseSummary ?? undefined,
    answeredQuestions: request.answeredQuestions,
  }
}

/**
 * Turns the tool calls the guard/audit hooks saw (spec §13) into log entries: blocked calls also as progress.
 * A stale attempt no longer writes to the log.
 */
function toolEventRecorder(
  deps: UseCaseDeps,
  ticketKey: string,
  reporter: Reporter,
  isCurrent: () => boolean,
): (event: ToolEvent) => void {
  return ({ kind, tool, target, reason }) => {
    if (!isCurrent()) return
    if (kind === 'blocked') {
      record(deps, ticketKey, 'system', 'guard_blocked', { tool, target, reason })
      reporter.logAndProgress(`Blockiert: ${tool} ${target}`)
    } else {
      record(deps, ticketKey, 'agent', 'tool_used', { tool, target })
    }
  }
}

/** Cost and tokens of a run, as stored on the AgentRun. */
function runUsage(meta: AgentRunMeta): Omit<RunCompletion, 'output'> {
  return {
    costUsd: meta.costUsd,
    inputTokens: meta.inputTokens,
    cacheCreationTokens: meta.cacheCreationTokens,
    cacheReadTokens: meta.cacheReadTokens,
    outputTokens: meta.outputTokens,
  }
}

/** Usage fields of a `run_finished` log entry: model, duration, cost and tokens. */
function runMetaPayload(meta: AgentRunMeta) {
  return { model: meta.model, durationSeconds: meta.durationSeconds, ...runUsage(meta) }
}

/**
 * The agent answered after the attempt became stale: its result is dropped. The run is still marked failed
 * (unless a reset removed it or someone else already ended it), keeping the usage it cost.
 */
function discardStaleResult({ deps, ticket, reporter, request }: Attempt, meta: AgentRunMeta): void {
  reporter.log('Agent result discarded: the attempt is no longer current')
  if (deps.runs.findById(request.runId)?.status !== 'running') return
  deps.runs.fail(request.runId, 'failed')
  record(deps, ticket.key, 'system', 'run_finished', {
    runId: request.runId, status: 'failed', reason: 'verworfen', ...runMetaPayload(meta),
  })
}

/** Stores the validated output and usage on the run and logs the successful run. */
function recordSucceededRun({ deps, ticket, reporter, request }: Attempt, output: StageOutput, meta: AgentRunMeta): void {
  reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
  deps.runs.complete(request.runId, { output, ...runUsage(meta) })
  record(deps, ticket.key, 'agent', 'run_finished', { runId: request.runId, status: 'succeeded', ...runMetaPayload(meta) })
}

/** Question → `awaiting_answer`; intent → rendered Markdown published as branch + PR (`in_review`). */
async function applyOutput({ deps, ticket, reporter, request }: Attempt, output: StageOutput): Promise<void> {
  if (output.type === 'question') {
    record(deps, ticket.key, 'agent', 'question_asked', { question: output.question })
    reporter.setState('awaiting_answer')
    reporter.question(output.question)
    return
  }
  reporter.progress('Intent wird als Pull Request angelegt…')
  await publishArtifact(deps, ticket, request.stage, {
    markdown: renderIntent(ticket, output.result, request.answeredQuestions),
    summary: output.result.problem,
  }, request.runId)
}

/**
 * Ends the run as failed/timeout. A current attempt fails the stage with a German message;
 * a stale one only logs (a stop surfaces as AgentRunTerminatedError and is expected). Never throws.
 */
function handleRunFailure({ deps, ticket, reporter, request, isCurrent }: Attempt, err: unknown): void {
  const current = isCurrent()
  const stopped = err instanceof AgentRunTerminatedError
  try {
    finishRun(deps, ticket.key, request.runId, err instanceof AgentRunTimeoutError ? 'timeout' : 'failed')
    if (current) {
      failStage(deps, reporter, ticket.key, stopped ? 'Agent-Lauf wurde beendet' : describeError(err))
    } else {
      reporter.log(stopped ? 'Agent run stopped' : `Attempt no longer current, error ignored: ${describeError(err)}`)
    }
  } catch (inner) {
    reporter.log(`ERROR while handling failure: ${describeError(inner)}`)
  }
}
