import { desc, eq } from 'drizzle-orm'
import type { AgentRunRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns, tickets } from './schema'

export function createSqliteAgentRunRepository(db: SqliteDb): AgentRunRepository {
  return {
    create(input) {
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

    listForTicket: (ticketId) =>
      db.select().from(agentRuns).where(eq(agentRuns.ticketId, ticketId)).orderBy(agentRuns.iteration).all(),

    latestForTicket: (ticketId) =>
      db.select().from(agentRuns)
        .where(eq(agentRuns.ticketId, ticketId))
        .orderBy(desc(agentRuns.iteration))
        .limit(1)
        .get() ?? null,

    findStuck: () => db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).all(),
  }
}
