import { z } from 'zod'
import { ChoiceOutputSchema, QuestionOutputSchema } from './agentOutput'
import { IntentOutputSchema } from './intentSchema'
import { SpecOutputSchema } from './specSchema'

/** Everything an agent run may return, across all stages: question, choice (Design), intent (Plan) or spec (Design). */
export const StageOutputSchema = z.discriminatedUnion('type', [
  QuestionOutputSchema,
  ChoiceOutputSchema,
  IntentOutputSchema,
  SpecOutputSchema,
])
/** Output of any stage agent; stored on the AgentRun. */
export type StageOutput = z.infer<typeof StageOutputSchema>
