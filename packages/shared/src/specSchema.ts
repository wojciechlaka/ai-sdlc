import { z } from 'zod'
import { ChoiceOutputSchema, QuestionOutputSchema } from './agentOutput'

/** Result of stage 2 (Design): how the intent is solved — approach, components, criteria, files, risks. */
export const SpecSchema = z.object({
  /** Short title of the spec (heading of `spec.md`). */
  title: z.string().max(60),
  /** What the change achieves, in a few sentences; also the PR summary. */
  goal: z.string(),
  /** The chosen approach, why, and the alternatives that were dropped. */
  approach: z.object({
    chosen: z.string(),
    rationale: z.string(),
    alternatives: z.array(z.object({ name: z.string(), reason: z.string() })),
  }),
  /** Units of the design: purpose, interface and what each depends on. */
  components: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    interface: z.string(),
    dependsOn: z.array(z.string()),
  })),
  /** How data moves through the components. */
  dataFlow: z.string(),
  /** Which errors can occur and how they are handled. */
  errorHandling: z.string(),
  /** Verifiable criteria; together they cover every success criterion of the intent. */
  acceptanceCriteria: z.array(z.string()).min(1),
  /** What is verified with which kind of test. */
  tests: z.string(),
  /** Files that change; `isNew` marks files that do not exist yet. */
  affectedFiles: z.array(z.object({ path: z.string(), change: z.string(), isNew: z.boolean() })),
  /** Risks with severity and mitigation. */
  risks: z.array(z.object({
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
  })),
  /** Questions that stay open but do not block the spec. */
  openPoints: z.array(z.object({ question: z.string() })),
})
export type Spec = z.infer<typeof SpecSchema>

/** The spec as agent output. */
export const SpecOutputSchema = z.object({ type: z.literal('spec'), result: SpecSchema })

/** Agent output of stage 2: a blocking question, a choice between approaches, or the spec. */
export const SpecAgentOutputSchema = z.discriminatedUnion('type', [QuestionOutputSchema, ChoiceOutputSchema, SpecOutputSchema])
export type SpecAgentOutput = z.infer<typeof SpecAgentOutputSchema>
