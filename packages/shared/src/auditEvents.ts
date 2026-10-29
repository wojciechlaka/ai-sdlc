import { z } from 'zod'
import { ArtifactStageSchema, StageSchema } from './stages'

// Contract of the per-ticket log (AuditEvent): one payload shape per event type. The core writes entries through
// `AuditLog.append`, which is typed by `AuditPayloads`; the web parses stored entries with `AuditEventSchema`.

/** Who caused a log entry. */
export const AuditActorSchema = z.enum(['human', 'agent', 'system'])
export type AuditActor = z.infer<typeof AuditActorSchema>

/** One log entry type with its payload schema; the type is the discriminator of `AuditEventSchema`. */
const event = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload })

const prNumber = z.number().int()

/** Usage of a finished agent run; absent on runs that ended without a Claude result (stop, restart, error). */
const RunUsageSchema = z.object({
  model: z.string(),
  durationSeconds: z.number(),
  costUsd: z.number(),
  inputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  outputTokens: z.number(),
}).partial()

/** Typed log entry: `type` plus the payload that belongs to it. */
export const AuditEventSchema = z.discriminatedUnion('type', [
  event('ticket_imported', z.object({ sourcePath: z.string() })),
  event('run_started', z.object({
    runId: z.string(),
    stage: ArtifactStageSchema,
    trigger: z.enum(['initial', 'answer']),
    model: z.string(),
  })),
  event('run_finished', RunUsageSchema.extend({
    runId: z.string(),
    status: z.enum(['succeeded', 'failed', 'timeout']),
    /** Why a run failed without an error of its own, e.g. `Neustart` or `verworfen` (German: shown in the log). */
    reason: z.string().optional(),
  })),
  event('question_asked', z.object({ question: z.string() })),
  event('answer_given', z.object({ answer: z.string() })),
  event('pr_opened', z.object({ prNumber, prUrl: z.string(), branch: z.string() })),
  event('pr_merged', z.object({ prNumber })),
  event('pr_closed', z.object({ prNumber })),
  event('stage_changed', z.object({ from: StageSchema, to: StageSchema })),
  /** Startup closed an open PR of the app and deleted its branch. */
  event('cleanup', z.object({ prNumber, branch: z.string() })),
  event('error', z.object({ message: z.string() })),
  /** The guard hook denied a tool call of the agent. */
  event('guard_blocked', z.object({ tool: z.string(), target: z.string(), reason: z.string().optional() })),
  /** The agent ran a tool call. */
  event('tool_used', z.object({ tool: z.string(), target: z.string() })),
])
export type AuditEvent = z.infer<typeof AuditEventSchema>

/** Union of all log entry types; the keys of `AuditPayloads`. */
export type AuditEventType = AuditEvent['type']

/** Payload per log entry type, e.g. `AuditPayloads['pr_merged']` is `{ prNumber: number }`. */
export type AuditPayloads = { [E in AuditEvent as E['type']]: E['payload'] }

/**
 * Input tokens of a finished run as the UI counts them: uncached input plus cache writes (new context the model
 * processed). Cache reads are the same prompt prefix re-read on every turn and would inflate the count many times
 * over, so they are left out. Used by the log line and the cost summary alike.
 */
export function runInputTokens(run: AuditPayloads['run_finished']): number {
  return (run.inputTokens ?? 0) + (run.cacheCreationTokens ?? 0)
}
