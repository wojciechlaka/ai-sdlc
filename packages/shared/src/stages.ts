import { z } from 'zod'

/** Playbook stage of a ticket. `done` = every showcase stage is merged. */
export const StageSchema = z.enum(['plan', 'design', 'done'])
export type Stage = z.infer<typeof StageSchema>

/** Stages that produce an artifact (file + branch + PR). */
export const ArtifactStageSchema = z.enum(['plan', 'design'])
export type ArtifactStage = z.infer<typeof ArtifactStageSchema>

/** Where a ticket stands inside its current stage. */
export const TicketStateSchema = z.enum(['ready', 'running', 'awaiting_answer', 'in_review', 'failed'])
export type TicketState = z.infer<typeof TicketStateSchema>

export const PrStateSchema = z.enum(['open', 'merged', 'closed'])
export type PrState = z.infer<typeof PrStateSchema>
