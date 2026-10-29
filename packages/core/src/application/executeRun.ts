import type { AgentRunInput, QAPair } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'
import { statusAfterRun } from '../domain/rules'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'

export interface RunRequest {
  trigger: 'initial' | 'answer'
  input: AgentRunInput
  repoPath: string
  codebaseSummary: string | null
  previousRuns?: QAPair[]
}

/**
 * Creates a run, executes the agent and records the outcome.
 * Never throws: every error ends in a ticket status change and, once the run exists, a terminal run status.
 */
export async function executeRun(deps: UseCaseDeps, ticketId: number, request: RunRequest): Promise<void> {
  const reporter = createReporter(deps, ticketId)
  let runId: string | undefined

  try {
    const run = deps.runs.create({ ticketId, trigger: request.trigger, model: request.input.model, input: request.input })
    runId = run.id
    deps.audit.append({ ticketId, actor: 'system', type: 'run_started', payload: { runId } })

    const { output, meta } = await deps.agent.run(
      {
        ticketId: formatTicketId(ticketId),
        title: request.input.ticketTitle,
        description: request.input.ticketDescription,
        acceptanceCriteria: request.input.acceptanceCriteria,
        repoPath: request.repoPath,
        model: request.input.model,
        codebaseSummary: request.codebaseSummary ?? undefined,
        previousRuns: request.previousRuns,
      },
      reporter.report,
    )

    reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
    deps.runs.complete(runId, {
      output,
      costUsd: meta.costUsd,
      inputTokens: meta.inputTokens,
      cacheCreationTokens: meta.cacheCreationTokens,
      cacheReadTokens: meta.cacheReadTokens,
      outputTokens: meta.outputTokens,
    })
    deps.audit.append({ ticketId, actor: 'agent', type: 'run_finished', payload: { runId, status: 'succeeded' } })

    if (output.type === 'question') {
      reporter.progress('Agent stellt eine Rückfrage...')
      reporter.question(output.question)
    } else {
      reporter.setStatus(statusAfterRun(output))
    }
  } catch (err) {
    if (err instanceof AgentRunTerminatedError) {
      reporter.log('Refinement terminated by user')
      if (runId !== undefined) {
        deps.runs.fail(runId, 'failed')
        deps.audit.append({ ticketId, actor: 'system', type: 'run_finished', payload: { runId, status: 'failed' } })
      }
      reporter.setStatus('backlog')
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    reporter.log(`ERROR: ${message}`)
    reporter.progress(`Fehler: ${message}`)
    const runStatus = err instanceof AgentRunTimeoutError ? 'timeout' : 'failed'
    if (runId !== undefined) {
      deps.runs.fail(runId, runStatus)
      deps.audit.append({ ticketId, actor: 'system', type: 'run_finished', payload: { runId, status: runStatus } })
    }
    reporter.setStatus('failed')
  }
}
