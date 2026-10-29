import { AnswerInput, StartStageInput } from '@refinement/shared'
import { ConflictError, errorCode } from '../domain/errors'
import { canAnswer, canStartStage, canStop, currentArtifactStage, planAnswerRun } from '../domain/rules'
import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { RESET_RUNNING, TOKEN_MISSING } from './messages'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { beginRun, type RunRequest } from './runLifecycle'
import { runStage } from './runStage'

/** The reset empties the database and rewrites the repo; a run started meanwhile would act on stale state. */
function rejectDuringReset(deps: UseCaseDeps): void {
  if (deps.resetState.resetting) throw new ConflictError(RESET_RUNNING)
}

/** Validates, sets `running` and hands the stage to the background. Returns immediately. */
export function startStage(deps: UseCaseDeps, key: string, raw: unknown): void {
  rejectDuringReset(deps)
  const ticket = requireTicket(deps.tickets, key)
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canStartStage(ticket)) {
    throw new ConflictError(`Stufe kann im Zustand ${ticket.stage}/${ticket.state} nicht gestartet werden`)
  }
  const { model } = parseInput(StartStageInput, raw)

  createReporter(deps, ticket.key).setState('running')
  const request: RunRequest = { stage, trigger: 'initial', model, answeredQuestions: [] }
  deps.runInBackground(runStage(deps, ticket, { ...request, runId: beginRun(deps, ticket, request) }))
}

/**
 * Continues the stage with the answer in a new run (same model, full Q&A history). Returns immediately.
 * The ticket is `running` right away, so a second answer is rejected.
 */
export function answerQuestion(deps: UseCaseDeps, key: string, raw: unknown): void {
  rejectDuringReset(deps)
  const ticket = requireTicket(deps.tickets, key)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canAnswer(ticket)) throw new ConflictError('Ticket wartet nicht auf eine Antwort')
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const { answer } = parseInput(AnswerInput, raw)
  const plan = planAnswerRun(deps.runs.listForTicket(ticket.key, stage), answer)
  if (!plan) throw new ConflictError('Keine offene Rückfrage gefunden')

  deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'answer_given', payload: { answer } })
  createReporter(deps, ticket.key).setState('running')
  const request: RunRequest = { stage, trigger: 'answer', model: plan.questionRun.input.model, answeredQuestions: plan.answeredQuestions }
  deps.runInBackground(runStage(deps, ticket, { ...request, runId: beginRun(deps, ticket, request) }))
}

/**
 * Stops the agent and returns a running or waiting ticket to `ready` at once.
 * Idempotent: unknown tickets and tickets without a run are ignored.
 */
export function stopRun(deps: UseCaseDeps, key: string): void {
  let ticket: Ticket
  try {
    ticket = requireTicket(deps.tickets, key)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') return
    throw err
  }
  if (!canStop(ticket)) return
  deps.agent.stop(ticket.key)
  createReporter(deps, ticket.key).setState('ready')
}
