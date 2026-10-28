import { and, count, eq, sql } from 'drizzle-orm'
import type { AgentRunRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns } from './schema'

export function createSqliteAgentRunRepository(db: SqliteDb): AgentRunRepository {
  return {
    create(input) {
      return db.transaction((tx) => {
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
    },

    findById: (id) => db.select().from(agentRuns).where(eq(agentRuns.id, id)).get() ?? null,

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
        .all(),

    findStuck: () => db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).orderBy(sql`rowid`).all(),
  }
}
