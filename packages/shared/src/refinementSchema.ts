import { z } from 'zod'

/** Result of the stage 2 agent (`skills/refinement-agent.md`); not wired yet (Design is not startable). */
export const RefinementOutputSchema = z.object({
  title:               z.string().max(60),
  userStory:           z.string(),
  acceptanceCriteria:  z.array(z.string()),
  affectedFiles:       z.array(z.object({
    path:        z.string(),
    description: z.string(),
  })),
  risks:               z.array(z.object({
    description: z.string(),
    severity:    z.enum(['low', 'medium', 'high']),
  })),
  openQuestions:       z.array(z.object({
    question:             z.string(),
    blocksImplementation: z.boolean(),
  })),
  confidence:          z.number().int().min(0).max(100),
})

export type RefinementOutput = z.infer<typeof RefinementOutputSchema>

/** A blocking question of an agent; every stage may return it instead of its result. */
export const QuestionOutputSchema = z.object({
  type: z.literal('question'),
  question: z.string(),
})

/** Agent output of stage 2: a blocking question or the refinement. */
export const AgentOutputSchema = z.discriminatedUnion('type', [
  QuestionOutputSchema,
  z.object({
    type: z.literal('refinement'),
    result: RefinementOutputSchema,
  }),
])

export type AgentOutput = z.infer<typeof AgentOutputSchema>
