import type { ArtifactStage, QAPair, RunTrigger, Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'

export interface RunRequest {
  stage: ArtifactStage
  trigger: RunTrigger
  model: string
  /** Answered questions so far; empty for the first run. */
  answeredQuestions: QAPair[]
}

/**
 * Creates the run that identifies this attempt. Called synchronously by the command,
 * right after the ticket was set to `running`.
 * @returns the run id.
 */
export function beginRun(deps: UseCaseDeps, ticket: Ticket, request: RunRequest): string {
  const run = deps.runs.create({
    ticketKey: ticket.key, stage: request.stage, trigger: request.trigger, model: request.model,
    input: { model: request.model, answeredQuestions: request.answeredQuestions },
  })
  deps.audit.append({
    ticketKey: ticket.key, actor: 'system', type: 'run_started',
    payload: { runId: run.id, stage: request.stage, trigger: request.trigger, model: request.model },
  })
  return run.id
}

/** True while the attempt is the ticket's latest run and the ticket still runs (not stopped, restarted or reset). */
export function isCurrentRun(deps: UseCaseDeps, ticketKey: string, runId: string): boolean {
  return deps.tickets.findByKey(ticketKey)?.state === 'running' && deps.runs.listForTicket(ticketKey).at(-1)?.id === runId
}

/** Ends a run as failed/timeout if it is still `running`; tolerant of runs removed by a reset. */
export function finishRun(deps: UseCaseDeps, ticketKey: string, runId: string, status: 'failed' | 'timeout'): void {
  if (deps.runs.findById(runId)?.status !== 'running') return
  deps.runs.fail(runId, status)
  deps.audit.append({ ticketKey, actor: 'system', type: 'run_finished', payload: { runId, status } })
}
