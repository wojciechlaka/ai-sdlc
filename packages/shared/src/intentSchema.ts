import { z } from 'zod'
import { QuestionOutputSchema } from './refinementSchema'

/** Result of stage 1 (Plan): what the problem is, not how to solve it. */
export const IntentSchema = z.object({
  /** Short title of the intent (heading of `intent.md`). */
  title: z.string().max(60),
  /** What is wrong or missing today; also the PR summary. */
  problem: z.string(),
  /** What should be true once the problem is solved. */
  desiredOutcome: z.string(),
  /**
   * Observable, verifiable statements at outcome level, from the user's or business view, without solution
   * details (no endpoints, fields, files). They are not acceptance criteria: those belong to the spec
   * (stage 2) and are derived from these.
   */
  successCriteria: z.array(z.string()).min(1),
  /** Who or what is affected (users, areas of the code). */
  affected: z.array(z.string()),
  /** Questions that stay open but do not block the intent. */
  openPoints: z.array(z.object({ question: z.string() })),
})
export type Intent = z.infer<typeof IntentSchema>

/** Agent output of stage 1: a blocking question or the intent. */
export const IntentAgentOutputSchema = z.discriminatedUnion('type', [
  QuestionOutputSchema,
  z.object({ type: z.literal('intent'), result: IntentSchema }),
])
export type IntentAgentOutput = z.infer<typeof IntentAgentOutputSchema>

/** Everything an agent run may return, across all stages. Part B adds the spec output of stage 2. */
export const StageOutputSchema = IntentAgentOutputSchema
/** Output of any stage agent; widens with `StageOutputSchema` when stage 2 is added. */
export type StageOutput = IntentAgentOutput
