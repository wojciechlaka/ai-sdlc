import { z } from 'zod'

// Agent outputs that ask the human instead of delivering the stage result: a free-text question (every stage)
// or a choice between 2–3 approaches (stage 2, Design).

/** A blocking question of an agent; every stage may return it instead of its result. */
export const QuestionOutputSchema = z.object({
  type: z.literal('question'),
  question: z.string(),
})
export type QuestionOutput = z.infer<typeof QuestionOutputSchema>

/** Id of an option in a choice. */
export const ChoiceIdSchema = z.enum(['A', 'B', 'C'])
export type ChoiceId = z.infer<typeof ChoiceIdSchema>

/** One approach the human can pick: title, description, pros and cons. */
export const ChoiceOptionSchema = z.object({
  id: ChoiceIdSchema,
  title: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
})
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>

/** Fields of a choice, shared by the agent output and the pending choice of the ticket page. */
const choiceFields = {
  /** What the human decides, e.g. „Wo wird die Lesezeit berechnet?“. */
  question: z.string(),
  /** 2–3 approaches with unique ids. */
  options: z.array(ChoiceOptionSchema).min(2).max(3),
  /** Id of the option the agent recommends; one of `options`. */
  recommended: ChoiceIdSchema,
}

/** Ids are unique and the recommendation is one of them. German messages: they reach the agent's retry prompt. */
function checkChoice(choice: { options: { id: ChoiceId }[]; recommended: ChoiceId }, ctx: z.RefinementCtx): void {
  const ids = choice.options.map((option) => option.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'Die ids der Optionen müssen eindeutig sein', path: ['options'] })
  }
  if (!ids.includes(choice.recommended)) {
    ctx.addIssue({ code: 'custom', message: 'recommended muss die id einer der Optionen sein', path: ['recommended'] })
  }
}

/** A choice without its `type`: what the ticket page shows while the ticket waits for the human's pick. */
export const PendingChoiceSchema = z.object(choiceFields).superRefine(checkChoice)
export type PendingChoice = z.infer<typeof PendingChoiceSchema>

/** The agent offers 2–3 approaches and recommends one; the human picks one (stage 2 only). */
export const ChoiceOutputSchema = z.object({ type: z.literal('choice'), ...choiceFields }).superRefine(checkChoice)
export type ChoiceOutput = z.infer<typeof ChoiceOutputSchema>
