import { StartStageInput } from '@refinement/shared'
import { ConflictError } from '../domain/errors'
import { canStartStage, currentArtifactStage } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { TOKEN_MISSING } from './messages'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { runStage } from './runStage'

/** Validates, sets `running` and hands the stage to the background. Returns immediately. */
export function startStage(deps: UseCaseDeps, key: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, key)
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canStartStage(ticket)) {
    throw new ConflictError(`Stufe kann im Zustand ${ticket.stage}/${ticket.state} nicht gestartet werden`)
  }
  const { model } = parseInput(StartStageInput, raw)

  createReporter(deps, ticket.key).setState('running')
  deps.runInBackground(runStage(deps, ticket, { stage, trigger: 'initial', model, previousRuns: [] }))
}
