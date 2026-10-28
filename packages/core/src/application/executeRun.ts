import type { ArtifactStage, QAPair, RunTrigger, Ticket } from '../domain/types'
import { renderIntent } from '../domain/render'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { failStage } from './failStage'
import { publishArtifact } from './publishArtifact'

export interface StageRunRequest {
  stage: ArtifactStage
  trigger: RunTrigger
  model: string
  /** Answered questions so far; empty for the first run. */
  previousRuns: QAPair[]
}

export interface ExecuteRunRequest extends StageRunRequest {
  repoDir: string
  codebaseSummary: string | null
}

/**
 * Creates a run, executes the agent and applies its outcome: question → `awaiting_answer`,
 * intent → branch + PR → `in_review`. Never throws.
 * A stop sets the ticket to `ready` while the agent may still answer; such late results are discarded.
 */
export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const stillRunning = () => deps.tickets.findByKey(ticket.key)?.state === 'running'
  let runId: string | undefined

  /** Ends the run as failed/timeout once; skipped after a reset removed the ticket. */
  const finishRun = (status: 'failed' | 'timeout') => {
    if (runId === undefined || !deps.tickets.findByKey(ticket.key)) return
    deps.runs.fail(runId, status)
    deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'run_finished', payload: { runId, status } })
    runId = undefined
  }

  try {
    const run = deps.runs.create({
      ticketKey: ticket.key, stage: request.stage, trigger: request.trigger, model: request.model,
      input: { model: request.model, previousRuns: request.previousRuns },
    })
    runId = run.id
    deps.audit.append({
      ticketKey: ticket.key, actor: 'system', type: 'run_started',
      payload: { runId, stage: request.stage, trigger: request.trigger, model: request.model },
    })

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

    if (!stillRunning()) {
      reporter.log('Agent result discarded: the run was stopped')
      finishRun('failed')
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
    runId = undefined

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
    })
  } catch (err) {
    if (err instanceof AgentRunTerminatedError || !stillRunning()) {
      reporter.log('Agent run stopped')
      finishRun('failed')
      return
    }
    finishRun(err instanceof AgentRunTimeoutError ? 'timeout' : 'failed')
    failStage(deps, reporter, ticket.key, describeError(err))
  }
}
