import { z } from 'zod'
import { ArtifactStageSchema, PrStateSchema, StageSchema, TicketStateSchema } from './stages'
import { AuditActorSchema } from './auditEvents'

const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)

export const PullRequestRefSchema = z.object({
  number: z.number().int(),
  url: z.string(),
  state: PrStateSchema,
})
export type PullRequestRefDto = z.infer<typeof PullRequestRefSchema>

export const TicketSchema = z.object({
  /** Ticket key from the source file, e.g. `CB-3`. */
  key: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
  title: z.string(),
  description: z.string(),
  priority: z.string().nullable(),
  /** Source file relative to the repository root, e.g. `examples/tickets/cb-3-kommentare-melden.md`. */
  sourcePath: z.string(),
  stage: StageSchema,
  state: TicketStateSchema,
  /** PR of the current stage while the ticket is `in_review`. */
  openPr: PullRequestRefSchema.nullable(),
  updatedAt: z.date(),
})
export type TicketDto = z.infer<typeof TicketSchema>

export const StageViewSchema = z.object({
  stage: ArtifactStageSchema,
  /** Artifact path in the target repository, e.g. `docs/work/CB-3/intent.md`. */
  path: z.string(),
  /** Link to the file on the base branch (`showcase`). */
  fileUrl: z.string(),
  /** True once the artifact is merged and the ticket moved on. */
  completed: z.boolean(),
  /** Latest PR the app opened for this stage. */
  pr: PullRequestRefSchema.nullable(),
  mergedAt: z.date().nullable(),
  /** File content read live from the base branch; null if not merged or not readable. */
  content: z.string().nullable(),
})
export type StageViewDto = z.infer<typeof StageViewSchema>

/**
 * One stored entry of the ticket log as the core returns it. `type` and `payload` stay loose because old rows may
 * predate the current contract; the web parses them with `AuditEventSchema` and falls back to the type name.
 */
export const AuditLogEntrySchema = z.object({
  actor: AuditActorSchema,
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.date(),
})
export type AuditLogEntryDto = z.infer<typeof AuditLogEntrySchema>

export const TicketDetailSchema = TicketSchema.extend({
  stages: z.array(StageViewSchema),
  log: z.array(AuditLogEntrySchema),
  /** Question of the agent while the ticket is `awaiting_answer`. */
  pendingQuestion: z.string().nullable(),
})
export type TicketDetailDto = z.infer<typeof TicketDetailSchema>

export const SettingsSchema = z.object({
  /** `TARGET_REPO` */
  repoUrl: z.string(),
  /** Branch of the target repository the app works on; PRs target it. */
  baseBranch: z.string(),
  /** False without `GITHUB_TOKEN`: stages cannot be started. */
  tokenConfigured: z.boolean(),
})
export type SettingsDto = z.infer<typeof SettingsSchema>

/** Input of `startStage`: the model the agent runs with. */
export const StartStageInputSchema = z.object({
  model: notBlank('Modell ist erforderlich'),
})
export type StartStageInput = z.infer<typeof StartStageInputSchema>

/** Input of `answerQuestion`: the human's answer to the open question. */
export const AnswerInputSchema = z.object({
  answer: notBlank('Antwort ist erforderlich'),
})
export type AnswerInput = z.infer<typeof AnswerInputSchema>
