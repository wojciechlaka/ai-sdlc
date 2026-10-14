import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { randomBytes } from 'crypto'
import type { AgentOutput } from '@refinement/shared'

export interface AgentRunInput {
  ticketTitle: string
  ticketDescription: string
  acceptanceCriteria: string
  repo: string
  model: string
  previousRuns?: Array<{ question: string; answer: string }>
  feedback?: string
}

export type TicketStatus = 'backlog' | 'refining' | 'review' | 'ready' | 'failed'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())

export const tickets = sqliteTable('tickets', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description').notNull().default(''),
  status:      text('status', { enum: ['backlog', 'refining', 'review', 'ready', 'failed'] })
                 .notNull().default('backlog'),
  iteration:   integer('iteration').notNull().default(0),
  createdAt:   createdAt(),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

export const agentRuns = sqliteTable('agent_runs', {
  id:                  text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:            integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  iteration:           integer('iteration').notNull(),
  trigger:             text('trigger', { enum: ['initial', 'answer', 'rework'] }).notNull(),
  input:               text('input', { mode: 'json' }).$type<AgentRunInput>().notNull(),
  output:              text('output', { mode: 'json' }).$type<AgentOutput | null>(),
  status:              text('status', { enum: ['running', 'succeeded', 'failed', 'timeout'] }).notNull(),
  model:               text('model').notNull(),
  costUsd:             real('cost_usd'),
  inputTokens:         integer('input_tokens'),
  cacheCreationTokens: integer('cache_creation_tokens'),
  cacheReadTokens:     integer('cache_read_tokens'),
  outputTokens:        integer('output_tokens'),
  startedAt:           integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  finishedAt:          integer('finished_at', { mode: 'timestamp' }),
})

export const reviewDecisions = sqliteTable('review_decisions', {
  id:         text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:   integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  agentRunId: text('agent_run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  decision:   text('decision', { enum: ['approve', 'request_changes'] }).notNull(),
  feedback:   text('feedback'),
  createdAt:  createdAt(),
})

export const auditEvents = sqliteTable('audit_events', {
  id:        text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:  integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  actor:     text('actor', { enum: ['human', 'agent', 'system'] }).notNull(),
  type:      text('type').notNull(),
  payload:   text('payload', { mode: 'json' }),
  createdAt: createdAt(),
})
