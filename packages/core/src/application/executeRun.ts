import type { AuditPayloads, StageOutput } from '@refinement/shared'
import type { Ticket } from '../domain/types'
import { renderIntent, renderSpec } from '../domain/render'
import { describeError } from '../domain/errors'
import { questionsRemaining } from '../domain/rules'
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
import { QUESTION_LIMIT_REACHED } from './messages'

/** RunRequest plus what `runStage` prepared: the run id, the checkout, the codebase summary and the intent. */
export interface ExecuteRunRequest extends RunRequest {
  /** The attempt's run, created by `beginRun`. */
  runId: string
  repoDir: string
  codebaseSummary: string | null
  /** Merged `intent.md` from the base branch; only for the design stage. */
  intent?: string
}

/** What one step of an attempt needs: deps, the ticket and its reporter, the request and the staleness check. */
interface Attempt {
  deps: UseCaseDeps
  ticket: Ticket
  reporter: Reporter
  request: ExecuteRunRequest
  /** True while this attempt is the ticket's current run (see `isCurrentRun`). */
  isCurrent: () => boolean
  /** Questions and choices the agent may still ask; null for a stage without limit. */
  questionsRemaining: number | null
}

/**
 * Executes the agent for the attempt's run and applies its outcome: question or choice → `awaiting_answer`,
 * intent or spec → branch + PR → `in_review`. Never throws.
 * A stop, restart or reset makes the attempt stale while the agent may still answer; late results are discarded.
 */
export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const isCurrent = () => isCurrentRun(deps, ticket.key, request.runId)
  const remaining = questionsRemaining(request.stage, deps.runs.listForTicket(ticket.key, request.stage))
  const attempt: Attempt = { deps, ticket, reporter, request, isCurrent, questionsRemaining: remaining }

  try {
    const { output, meta } = await deps.agent.run(agentInput(ticket, request, remaining), {
      onProgress: reporter.logAndProgress,
      onToolEvent: toolEventRecorder(attempt),
    })
    if (!isCurrent()) {
      discardStaleResult(attempt, meta)
      return
    }
    if (exceedsQuestionLimit(attempt, output)) {
      failOverLimit(attempt, meta)
      return
    }
    recordSucceededRun(attempt, output, meta)
    await applyOutput(attempt, output)
  } catch (err) {
    handleRunFailure(attempt, err)
  }
}

/** What the agent gets: ticket text, checkout, model, summary, intent (design), Q&A history and question budget. */
function agentInput(ticket: Ticket, request: ExecuteRunRequest, remaining: number | null): AgentRunnerInput {
  return {
    ticketKey: ticket.key,
    stage: request.stage,
    title: ticket.title,
    description: ticket.description,
    repoDir: request.repoDir,
    model: request.model,
    codebaseSummary: request.codebaseSummary ?? undefined,
    intent: request.intent,
    answeredQuestions: request.answeredQuestions,
    questionsRemaining: remaining ?? undefined,
  }
}

/**
 * Turns the tool calls the guard/audit hooks saw (spec §13) into log entries: blocked calls also as progress.
 * A stale attempt no longer writes to the log.
 */
function toolEventRecorder({ deps, ticket, reporter, isCurrent }: Attempt): (event: ToolEvent) => void {
  return ({ kind, tool, target, reason }) => {
    if (!isCurrent()) {
      return
    }
    if (kind === 'blocked') {
      record(deps, ticket.key, 'system', 'guard_blocked', { tool, target, reason })
      reporter.logAndProgress(`Blockiert: ${tool} ${target}`)
    } else {
      record(deps, ticket.key, 'agent', 'tool_used', { tool, target })
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

/** Usage fields of a `run_finished` log entry (everything but run id, status and reason). */
type RunUsagePayload = Omit<AuditPayloads['run_finished'], 'runId' | 'status' | 'reason'>

/** Usage fields of a `run_finished` log entry: model, duration, cost and tokens. */
function runMetaPayload(meta: AgentRunMeta): RunUsagePayload {
  return { model: meta.model, durationSeconds: meta.durationSeconds, ...runUsage(meta) }
}

/**
 * The agent answered after the attempt became stale: its result is dropped. The run is still marked failed
 * (unless a reset removed it or someone else already ended it), keeping the usage it cost.
 */
function discardStaleResult({ deps, ticket, reporter, request }: Attempt, meta: AgentRunMeta): void {
  reporter.log('Agent result discarded: the attempt is no longer current')
  if (deps.runs.findById(request.runId)?.status !== 'running') {
    return
  }
  deps.runs.fail(request.runId, 'failed')
  record(deps, ticket.key, 'system', 'run_finished', {
    runId: request.runId, status: 'failed', reason: 'verworfen', ...runMetaPayload(meta),
  })
}

/** True if the agent asks a question or offers a choice although its budget for this start is used up. */
function exceedsQuestionLimit({ questionsRemaining: remaining }: Attempt, output: StageOutput): boolean {
  return (output.type === 'question' || output.type === 'choice') && remaining === 0
}

/** The run delivered nothing usable: it is stored as failed (usage kept in the log) and the stage fails. */
function failOverLimit({ deps, ticket, reporter, request }: Attempt, meta: AgentRunMeta): void {
  reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)}), question limit reached`)
  deps.runs.fail(request.runId, 'failed')
  record(deps, ticket.key, 'system', 'run_finished', {
    runId: request.runId, status: 'failed', reason: 'grenze', ...runMetaPayload(meta),
  })
  failStage(deps, reporter, ticket.key, QUESTION_LIMIT_REACHED)
}

/** Stores the validated output and usage on the run and logs the successful run. */
function recordSucceededRun(
  { deps, ticket, reporter, request }: Attempt,
  output: StageOutput,
  meta: AgentRunMeta,
): void {
  reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
  deps.runs.complete(request.runId, { output, ...runUsage(meta) })
  record(deps, ticket.key, 'agent', 'run_finished', {
    runId: request.runId, status: 'succeeded', ...runMetaPayload(meta),
  })
}

/**
 * Question or choice → `awaiting_answer`; intent or spec → rendered Markdown published as branch + PR
 * (`in_review`).
 */
async function applyOutput({ deps, ticket, reporter, request }: Attempt, output: StageOutput): Promise<void> {
  switch (output.type) {
    case 'question':
      record(deps, ticket.key, 'agent', 'question_asked', { question: output.question })
      awaitAnswer(reporter, output.question)
      return
    case 'choice':
      record(deps, ticket.key, 'agent', 'choice_offered', {
        question: output.question,
        options: output.options.map(({ id, title }) => ({ id, title })),
        recommended: output.recommended,
      })
      awaitAnswer(reporter, output.question)
      return
    case 'intent':
      reporter.progress('Intent wird als Pull Request angelegt…')
      await publishArtifact(deps, ticket, request.stage, {
        markdown: renderIntent(ticket, output.result, request.answeredQuestions),
        summary: output.result.problem,
      }, request.runId)
      return
    case 'spec':
      reporter.progress('Spec wird als Pull Request angelegt…')
      await publishArtifact(deps, ticket, request.stage, {
        markdown: renderSpec(ticket, output.result, request.answeredQuestions),
        summary: output.result.goal,
      }, request.runId)
      return
    default: {
      // Compile-time guard: a new StageOutput type must be handled above.
      const unhandled: never = output
      throw new Error(`Unhandled stage output: ${JSON.stringify(unhandled)}`)
    }
  }
}

/** The ticket waits for the human; the question event makes open pages reload. */
function awaitAnswer(reporter: Reporter, question: string): void {
  reporter.setState('awaiting_answer')
  reporter.question(question)
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
