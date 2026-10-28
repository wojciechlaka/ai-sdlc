import { z } from 'zod'
import { QuestionOutputSchema } from './refinementSchema'

/** Result of stage 1 (Plan): what the problem is, not how to solve it. */
export const IntentSchema = z.object({
  title: z.string().max(60),
  problem: z.string(),
  desiredOutcome: z.string(),
  affected: z.array(z.string()),
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
export type StageOutput = IntentAgentOutput
