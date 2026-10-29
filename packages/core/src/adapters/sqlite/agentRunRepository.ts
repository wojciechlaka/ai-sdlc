import { and, count, eq, sql } from 'drizzle-orm'
import type { AgentRun, AgentRunInput, QAPair } from '../../domain/types'
import type { AgentRunRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns } from './schema'

type AgentRunRow = typeof agentRuns.$inferSelect

/**
 * Reads `agent_runs.input` tolerantly: rows written before the rename store the Q&A history as `previousRuns`.
 */
function toAgentRunInput(stored: AgentRunInput & { previousRuns?: QAPair[] }): AgentRunInput {
  const { previousRuns, ...input } = stored
  return { ...input, answeredQuestions: input.answeredQuestions ?? previousRuns ?? [] }
}

function toAgentRun(row: AgentRunRow): AgentRun {
  return { ...row, input: toAgentRunInput(row.input) }
}

/** AgentRunRepository port backed by the SQLite table `agent_runs`. */
export function createSqliteAgentRunRepository(db: SqliteDb): AgentRunRepository {
  return {
    create(input) {
      const row = db.transaction((tx) => {
        const existing = tx.select({ n: count() }).from(agentRuns).where(eq(agentRuns.ticketKey, input.ticketKey)).get()
        return tx.insert(agentRuns).values({
          ticketKey: input.ticketKey,
          stage: input.stage,
          seq: (existing?.n ?? 0) + 1,
          trigger: input.trigger,
          input: input.input,
          status: 'running',
          model: input.model,
          startedAt: new Date(),
        }).returning().get()
      })
      return toAgentRun(row)
    },

    findById: (id) => {
      const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
      return row ? toAgentRun(row) : null
    },

    complete(id, result) {
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
    },

    fail(id, status) {
      const row = db.update(agentRuns).set({ status, finishedAt: new Date() }).where(eq(agentRuns.id, id)).returning().get()
      if (!row) throw new Error(`AgentRun ${id} not found`)
    },

    listForTicket: (ticketKey, stage) =>
      db.select().from(agentRuns)
        .where(and(eq(agentRuns.ticketKey, ticketKey), stage ? eq(agentRuns.stage, stage) : undefined))
        .orderBy(agentRuns.seq)
        .all()
        .map(toAgentRun),

    findStuck: () => db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).orderBy(sql`rowid`).all().map(toAgentRun),
  }
}
