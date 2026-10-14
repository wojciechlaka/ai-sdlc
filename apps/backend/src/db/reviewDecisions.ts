import { eq } from 'drizzle-orm'
import { db } from './client'
import { reviewDecisions } from './schema'

export type ReviewDecisionRow = typeof reviewDecisions.$inferSelect

/**
 * Records a human reviewer's decision (`approve` or `request_changes`) for a specific agent run.
 * @param input - Ticket ID, agent run ID, decision, and optional feedback text.
 */
export function insertReviewDecision(input: {
  ticketId: number
  agentRunId: string
  decision: 'approve' | 'request_changes'
  feedback?: string
}): ReviewDecisionRow {
  return db.insert(reviewDecisions).values({
    ticketId: input.ticketId,
    agentRunId: input.agentRunId,
    decision: input.decision,
    feedback: input.feedback ?? null,
  }).returning().get()
}

/**
 * Returns all review decisions for a ticket in insertion order.
 * @param ticketId - Numeric ticket ID.
 */
export function getDecisionsForTicket(ticketId: number): ReviewDecisionRow[] {
  return db.select().from(reviewDecisions).where(eq(reviewDecisions.ticketId, ticketId)).all()
}
