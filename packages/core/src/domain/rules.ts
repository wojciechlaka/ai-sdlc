import type { AgentRun, ArtifactStage, QAPair, Stage, Ticket, TicketState } from './types'

/** Stages that can be started in this version. Part B adds 'design'. */
export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan']

const STAGE_ORDER: readonly Stage[] = ['plan', 'design', 'done']

/** The artifact stage the ticket is in; null once it is `done`. */
export function currentArtifactStage(ticket: Pick<Ticket, 'stage'>): ArtifactStage | null {
  return ticket.stage === 'done' ? null : ticket.stage
}

/** A stage starts from `ready` or after a failure. */
export function canStartStage(ticket: Pick<Ticket, 'stage' | 'state'>): boolean {
  const stage = currentArtifactStage(ticket)
  return stage !== null && STARTABLE_STAGES.includes(stage) && (ticket.state === 'ready' || ticket.state === 'failed')
}

export function canAnswer(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'awaiting_answer'
}

export function canStop(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'running' || ticket.state === 'awaiting_answer'
}

/** Stage after a merged artifact. */
export function nextStage(stage: ArtifactStage): Stage {
  return stage === 'plan' ? 'design' : 'done'
}

/** True once the ticket moved past `stage`, i.e. its artifact is merged. */
export function isStageCompleted(ticket: Pick<Ticket, 'stage'>, stage: ArtifactStage): boolean {
  return STAGE_ORDER.indexOf(ticket.stage) > STAGE_ORDER.indexOf(stage)
}

/** Stage implied by the artifacts found on the base branch (showcase). */
export function stageFromRepo(files: { hasIntent: boolean; hasSpec: boolean }): Stage {
  if (files.hasSpec) return 'done'
  if (files.hasIntent) return 'design'
  return 'plan'
}

/**
 * Applies the stage found on the base branch (showcase) after the start-up cleanup.
 * A changed stage starts over as `ready`; `in_review` becomes `ready` because the start-up closed
 * every open PR of the app; other states (e.g. `awaiting_answer`) survive a restart.
 */
export function reconcile(ticket: Pick<Ticket, 'stage' | 'state'>, repoStage: Stage): { stage: Stage; state: TicketState } {
  if (repoStage !== ticket.stage) return { stage: repoStage, state: 'ready' }
  if (ticket.state === 'in_review') return { stage: ticket.stage, state: 'ready' }
  return { stage: ticket.stage, state: ticket.state }
}

/**
 * Finds the open question and builds the Q&A history for the answer run.
 * Only the latest run counts: a question followed by another run is no longer open.
 * @param runs   - Runs of one ticket and stage in `seq` order.
 * @param answer - The human's answer to the open question.
 */
export function planAnswerRun(
  runs: AgentRun[],
  answer: string,
): { questionRun: AgentRun; answeredQuestions: QAPair[] } | null {
  const latest = runs[runs.length - 1]
  const output = latest?.output
  if (!latest || output?.type !== 'question') return null
  return { questionRun: latest, answeredQuestions: [...latest.input.answeredQuestions, { question: output.question, answer }] }
}
