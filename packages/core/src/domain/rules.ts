import type { AgentOutput } from '@refinement/shared'
import type { AgentRun, QAPair, Ticket, TicketStatus } from './types'

/** Refinement can start from `backlog` or `review` (re-run). */
export function canStartRefinement(ticket: Ticket): boolean {
  return ticket.status === 'backlog' || ticket.status === 'review'
}

/** True while an answer-triggered run is still executing — a second answer must be rejected. */
export function isAnswerInProgress(latestRun: AgentRun | null): boolean {
  return latestRun?.trigger === 'answer' && latestRun.status === 'running'
}

/** A ticket cannot be deleted while its agent is running. */
export function canDelete(ticket: Ticket): boolean {
  return ticket.status !== 'refining'
}

/** A finished refinement goes to review; a question keeps the ticket refining until answered. */
export function statusAfterRun(output: AgentOutput): TicketStatus {
  return output.type === 'refinement' ? 'review' : 'refining'
}

/**
 * Finds the latest open question and builds the Q&A history for the next run.
 * The history continues from the latest answer-triggered run, if any.
 * Returns null when no run has asked a question.
 * @param runs   - All runs of the ticket in iteration order.
 * @param answer - The human's answer to the latest question.
 */
export function planAnswerRun(
  runs: AgentRun[],
  answer: string,
): { questionRun: AgentRun; previousRuns: QAPair[] } | null {
  let questionRun: AgentRun | undefined
  let answerRun: AgentRun | undefined
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!
    if (!questionRun && run.output?.type === 'question') questionRun = run
    if (!answerRun && run.trigger === 'answer') answerRun = run
    if (questionRun && answerRun) break
  }
  const output = questionRun?.output
  if (!questionRun || output?.type !== 'question') return null

  const existing = answerRun?.input.previousRuns ?? []
  return { questionRun, previousRuns: [...existing, { question: output.question, answer }] }
}
