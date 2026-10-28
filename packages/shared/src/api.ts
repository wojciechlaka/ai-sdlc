import { z } from 'zod'
import { AgentOutputSchema } from './refinementSchema'

const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)

export const TicketStatusSchema = z.enum(['backlog', 'refining', 'review', 'ready', 'failed'])
export type TicketStatus = z.infer<typeof TicketStatusSchema>

export const RunTriggerSchema = z.enum(['initial', 'answer', 'rework'])
export type RunTrigger = z.infer<typeof RunTriggerSchema>

export const RunStatusSchema = z.enum(['running', 'succeeded', 'failed', 'timeout'])
export type RunStatus = z.infer<typeof RunStatusSchema>

export const TicketSchema = z.object({
  id: z.string().regex(/^T-\d+$/),
  title: z.string(),
  description: z.string(),
  status: TicketStatusSchema,
  iteration: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type TicketDto = z.infer<typeof TicketSchema>

export const AgentRunSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  iteration: z.number().int(),
  trigger: RunTriggerSchema,
  status: RunStatusSchema,
  model: z.string(),
  output: AgentOutputSchema.nullable(),
  costUsd: z.number().nullable(),
  inputTokens: z.number().int().nullable(),
  cacheCreationTokens: z.number().int().nullable(),
  cacheReadTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
})
export type AgentRunDto = z.infer<typeof AgentRunSchema>

export const TicketDetailSchema = TicketSchema.extend({
  latestRun: AgentRunSchema.nullable(),
})
export type TicketDetailDto = z.infer<typeof TicketDetailSchema>

export const CreateTicketInput = z.object({
  title: notBlank('Titel ist erforderlich'),
  description: notBlank('Beschreibung ist erforderlich'),
})
export type CreateTicketInput = z.infer<typeof CreateTicketInput>

/** `repo` is not checked as URL on purpose: SSH remotes and local paths are valid git sources. */
export const StartRefinementInput = z.object({
  repo: notBlank('Repository ist erforderlich'),
  model: notBlank('Modell ist erforderlich'),
  acceptanceCriteria: z.string().default(''),
})
export type StartRefinementInput = z.infer<typeof StartRefinementInput>

export const AnswerInput = z.object({
  answer: notBlank('Antwort ist erforderlich'),
})
export type AnswerInput = z.infer<typeof AnswerInput>
