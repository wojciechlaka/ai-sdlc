import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { randomBytes } from 'crypto'
import type { StageOutput } from '@refinement/shared'
import type { AgentRunInput } from '../../domain/types'
import type { AuditEventType } from '../../ports'

const id = () => text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex'))
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })
const createdAt = () => timestamp('created_at').notNull().$defaultFn(() => new Date())
const ticketKey = () => text('ticket_key').notNull().references(() => tickets.key, { onDelete: 'cascade' })
const artifactStage = () => text('stage', { enum: ['plan', 'design'] }).notNull()

/** Imported tickets with their stage and state; the key from the source file is the primary key. */
export const tickets = sqliteTable('tickets', {
  key:         text('key').primaryKey(),
  title:       text('title').notNull(),
  description: text('description').notNull().default(''),
  priority:    text('priority'),
  sourcePath:  text('source_path').notNull(),
  stage:       text('stage', { enum: ['plan', 'design', 'done'] }).notNull().default('plan'),
  state:       text('state', { enum: ['ready', 'running', 'awaiting_answer', 'in_review', 'failed'] })
                 .notNull().default('ready'),
  createdAt:   createdAt(),
  updatedAt:   timestamp('updated_at').notNull().$defaultFn(() => new Date()),
})

/** One row per attempt (`AgentRun`): input snapshot, validated output, status and usage. */
export const agentRuns = sqliteTable('agent_runs', {
  id:                  id(),
  ticketKey:           ticketKey(),
  stage:               artifactStage(),
  seq:                 integer('seq').notNull(),
  trigger:             text('trigger', { enum: ['initial', 'answer'] }).notNull(),
  input:               text('input', { mode: 'json' }).$type<AgentRunInput>().notNull(),
  output:              text('output', { mode: 'json' }).$type<StageOutput | null>(),
  status:              text('status', { enum: ['running', 'succeeded', 'failed', 'timeout'] }).notNull(),
  model:               text('model').notNull(),
  costUsd:             real('cost_usd'),
  inputTokens:         integer('input_tokens'),
  cacheCreationTokens: integer('cache_creation_tokens'),
  cacheReadTokens:     integer('cache_read_tokens'),
  outputTokens:        integer('output_tokens'),
  startedAt:           timestamp('started_at').notNull().$defaultFn(() => new Date()),
  finishedAt:          timestamp('finished_at'),
})

/** Artifact per ticket and stage: file path, branch and the PR that gates the stage. */
export const artifacts = sqliteTable('artifacts', {
  id:        id(),
  ticketKey: ticketKey(),
  stage:     artifactStage(),
  path:      text('path').notNull(),
  branch:    text('branch').notNull(),
  prNumber:  integer('pr_number').notNull(),
  prUrl:     text('pr_url').notNull(),
  prState:   text('pr_state', { enum: ['open', 'merged', 'closed'] }).notNull().default('open'),
  mergedAt:  timestamp('merged_at'),
  createdAt: createdAt(),
})

/** Per-ticket log shown on the ticket page; payload is JSON, typed by `AuditPayloads` on write. */
export const auditEvents = sqliteTable('audit_events', {
  id:        id(),
  ticketKey: ticketKey(),
  actor:     text('actor', { enum: ['human', 'agent', 'system'] }).notNull(),
  type:      text('type').$type<AuditEventType>().notNull(),
  payload:   text('payload', { mode: 'json' }),
  createdAt: createdAt(),
})
