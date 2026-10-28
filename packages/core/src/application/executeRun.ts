import type { Ticket } from '../domain/types'
import { renderIntent } from '../domain/render'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import type { UseCaseDeps } from './deps'
import { finishRun, isCurrentRun, type RunRequest } from './beginRun'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { failStage } from './failStage'
import { publishArtifact } from './publishArtifact'

export interface ExecuteRunRequest extends RunRequest {
  /** The attempt's run, created by `beginRun`. */
  runId: string
  repoDir: string
  codebaseSummary: string | null
}

/**
 * Executes the agent for the attempt's run and applies its outcome: question → `awaiting_answer`,
 * intent → branch + PR → `in_review`. Never throws.
 * A stop, restart or reset makes the attempt stale while the agent may still answer; such late results are discarded.
 */
export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const { runId } = request
  const isCurrent = () => isCurrentRun(deps, ticket.key, runId)

  try {
    const { output, meta } = await deps.agent.run(
      {
        ticketKey: ticket.key,
        stage: request.stage,
        title: ticket.title,
        description: ticket.description,
        repoPath: request.repoDir,
        model: request.model,
        codebaseSummary: request.codebaseSummary ?? undefined,
        previousRuns: request.previousRuns,
      },
      reporter.report,
    )

    if (!isCurrent()) {
      reporter.log('Agent result discarded: the attempt is no longer current')
      if (deps.runs.findById(runId)?.status === 'running') {
        deps.runs.fail(runId, 'failed')
        deps.audit.append({
          ticketKey: ticket.key, actor: 'system', type: 'run_finished',
          payload: { runId, status: 'failed', reason: 'verworfen', costUsd: meta.costUsd, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens },
        })
      }
      return
    }

    reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
    deps.runs.complete(runId, {
      output,
      costUsd: meta.costUsd,
      inputTokens: meta.inputTokens,
      cacheCreationTokens: meta.cacheCreationTokens,
      cacheReadTokens: meta.cacheReadTokens,
      outputTokens: meta.outputTokens,
    })
    deps.audit.append({
      ticketKey: ticket.key, actor: 'agent', type: 'run_finished',
      payload: {
        runId, status: 'succeeded', model: meta.model, durationSeconds: meta.durationSeconds, costUsd: meta.costUsd,
        inputTokens: meta.inputTokens, cacheCreationTokens: meta.cacheCreationTokens,
        cacheReadTokens: meta.cacheReadTokens, outputTokens: meta.outputTokens,
      },
    })

    if (output.type === 'question') {
      deps.audit.append({ ticketKey: ticket.key, actor: 'agent', type: 'question_asked', payload: { question: output.question } })
      reporter.setState('awaiting_answer')
      reporter.question(output.question)
      return
    }

    reporter.progress('Intent wird als Pull Request angelegt...')
    await publishArtifact(deps, ticket, request.stage, {
      markdown: renderIntent(ticket, output.result, request.previousRuns),
      summary: output.result.problem,
    }, runId)
  } catch (err) {
    const current = isCurrent()
    const status = err instanceof AgentRunTimeoutError ? 'timeout' : 'failed'
    try {
      finishRun(deps, ticket.key, runId, status)
      if (!current) {
        reporter.log('Agent run stopped')
      } else {
        failStage(deps, reporter, ticket.key, err instanceof AgentRunTerminatedError ? 'Agent-Lauf wurde beendet' : describeError(err))
      }
    } catch (inner) {
      reporter.log(`ERROR while handling failure: ${describeError(inner)}`)
    }
  }
}
