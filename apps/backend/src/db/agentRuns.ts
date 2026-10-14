import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { agentRuns, tickets } from './schema'
import type { AgentRunInput } from './schema'
import type { AgentOutput } from '@refinement/shared'

export type AgentRunRow = typeof agentRuns.$inferSelect

/**
 * Creates a new agent run and atomically increments the ticket's iteration counter.
 * The iteration value is written to both the ticket and the run inside a single transaction.
 * @param input - Ticket ID, trigger type, run input payload, and model identifier.
 */
export function createAgentRun(input: {
  ticketId: number
  trigger: 'initial' | 'answer' | 'rework'
  input: AgentRunInput
  model: string
}): AgentRunRow {
  return db.transaction((tx) => {
    const ticket = tx.select().from(tickets).where(eq(tickets.id, input.ticketId)).get()
    if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`)

    const iteration = ticket.iteration + 1
    tx.update(tickets)
      .set({ iteration, updatedAt: new Date() })
      .where(eq(tickets.id, input.ticketId))
      .run()

    return tx.insert(agentRuns).values({
      ticketId: input.ticketId,
      iteration,
      trigger: input.trigger,
      input: input.input,
      status: 'running',
      model: input.model,
      startedAt: new Date(),
    }).returning().get()
  })
}

/**
 * Throws if the run does not exist.
 * @param id - UUID of the agent run.
 */
export function getAgentRun(id: string): AgentRunRow {
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
  if (!row) throw new Error(`AgentRun ${id} not found`)

  return row
}

/**
 * Returns the most recent run for the ticket regardless of status, or null if none exist.
 * @param ticketId - Numeric ticket ID.
 */
export function getLatestRun(ticketId: number): AgentRunRow | null {
  return db.select().from(agentRuns)
    .where(eq(agentRuns.ticketId, ticketId))
    .orderBy(desc(agentRuns.iteration))
    .limit(1)
    .get() ?? null
}

/**
 * Returns all runs for a ticket ordered by iteration ASC — suitable for rebuilding Q&A history.
 * @param ticketId - Numeric ticket ID.
 */
export function getRunsForTicket(ticketId: number): AgentRunRow[] {
  return db.select().from(agentRuns)
    .where(eq(agentRuns.ticketId, ticketId))
    .orderBy(agentRuns.iteration)
    .all()
}

/**
 * Marks an agent run as completed with `status: 'succeeded'`.
 * Note: BOTH output types (`question` and `refinement`) result in `status: 'succeeded'`.
 * Do not assume that `status === 'succeeded'` implies a `refinement`-type output.
 * @param id     - UUID of the agent run.
 * @param result - Output and token/cost metrics to persist.
 */
export function completeAgentRun(id: string, result: {
  output: AgentOutput
  costUsd: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
}): void {
  const row = db.update(agentRuns).set({
    status: 'succeeded',
    output: result.output,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    cacheCreationTokens: result.cacheCreationTokens,
    cacheReadTokens: result.cacheReadTokens,
    outputTokens: result.outputTokens,
    finishedAt: new Date(),
  }).where(eq(agentRuns.id, id)).returning().get()

  if (!row) throw new Error(`AgentRun ${id} not found`)
}

/**
 * Marks an agent run as failed. Use `'timeout'` when the run exceeded its time limit.
 * @param id     - UUID of the agent run.
 * @param status - `'failed'` for general errors, `'timeout'` for time limit exceeded.
 */
export function failAgentRun(id: string, status: 'failed' | 'timeout'): void {
  const row = db.update(agentRuns).set({ status, finishedAt: new Date() }).where(eq(agentRuns.id, id)).returning().get()
  if (!row) throw new Error(`AgentRun ${id} not found`)
}

/** Returns all runs still in `'running'` state — used at startup to detect crash survivors. */
export function findStuckRuns(): AgentRunRow[] {
  return db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).all()
}
