import type { AnswerInput, ChoiceId, ChoiceOption, ChoiceOutput, QuestionOutput } from '@refinement/shared'
import type { AgentRun, ArtifactStage, QAPair, Stage, Ticket, TicketState } from './types'
import { ValidationError } from './errors'
import { ARTIFACT_STAGES } from './artifacts'

/** Stages that can be started; a stage is added once it has an agent (`STAGE_AGENTS` in adapters/claudeCli). */
export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan', 'design']

/** Playbook order: every artifact stage, then `done`. */
const STAGE_ORDER: readonly Stage[] = [...ARTIFACT_STAGES, 'done']

/** The artifact stage the ticket is in; null once it is `done`. */
export function currentArtifactStage(ticket: Pick<Ticket, 'stage'>): ArtifactStage | null {
  return ticket.stage === 'done' ? null : ticket.stage
}

/** A stage starts from `ready` or after a failure. */
export function canStartStage(ticket: Pick<Ticket, 'stage' | 'state'>): boolean {
  const stage = currentArtifactStage(ticket)
  return stage !== null && STARTABLE_STAGES.includes(stage) && (ticket.state === 'ready' || ticket.state === 'failed')
}

/** Only a ticket waiting for an answer takes one. */
export function canAnswer(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'awaiting_answer'
}

/** A running attempt or an open question can be stopped. */
export function canStop(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'running' || ticket.state === 'awaiting_answer'
}

/** Stage after a merged artifact. */
export function nextStage(stage: ArtifactStage): Stage {
  return stage === 'plan' ? 'design' : 'done'
}

/** True once the ticket moved past `stage`, i.e. its artifact is merged. */
export function isStageCompleted(ticket: Pick<Ticket, 'stage'>, stage: ArtifactStage): boolean {
  return STAGE_ORDER.indexOf(ticket.stage) > STAGE_ORDER.indexOf(stage)
}

/** Stage implied by the artifacts found on the base branch (showcase). */
export function stageFromRepo(files: { hasIntent: boolean; hasSpec: boolean }): Stage {
  if (files.hasSpec) {
    return 'done'
  }
  if (files.hasIntent) {
    return 'design'
  }
  return 'plan'
}

/**
 * Applies the stage found on the base branch (showcase) after the start-up cleanup.
 * A changed stage starts over as `ready`; `in_review` becomes `ready` because the start-up closed
 * every open PR of the app; other states (e.g. `awaiting_answer`) survive a restart.
 */
export function reconcile(ticket: Pick<Ticket, 'stage' | 'state'>, repoStage: Stage): { stage: Stage; state: TicketState } {
  if (repoStage !== ticket.stage) {
    return { stage: repoStage, state: 'ready' }
  }
  if (ticket.state === 'in_review') {
    return { stage: ticket.stage, state: 'ready' }
  }
  return { stage: ticket.stage, state: ticket.state }
}

/** Questions and choices the design agent may ask per stage attempt; stage 1 (Plan) has no limit. */
export const QUESTION_LIMIT = 3

/** Question limit of a stage: `QUESTION_LIMIT` for design, null (no limit) for plan. */
export function questionLimit(stage: ArtifactStage): number | null {
  return stage === 'design' ? QUESTION_LIMIT : null
}

/**
 * Questions and choices the agent asked since the stage was last started: outputs of type `question` or `choice`
 * from the latest `initial` run on. A new start (also after a failure) counts from 0 again.
 * @param runs - Runs of one ticket and stage in `seq` order.
 */
export function countQuestionsAsked(runs: AgentRun[]): number {
  let start = 0
  runs.forEach((run, index) => {
    if (run.trigger === 'initial') {
      start = index
    }
  })
  return runs.slice(start).filter((run) => run.output?.type === 'question' || run.output?.type === 'choice').length
}

/**
 * Questions and choices the agent may still ask in this attempt; null for a stage without limit.
 * @param runs - Runs of one ticket and stage in `seq` order.
 */
export function questionsRemaining(stage: ArtifactStage, runs: AgentRun[]): number | null {
  const limit = questionLimit(stage)
  return limit === null ? null : Math.max(0, limit - countQuestionsAsked(runs))
}

/** Answer text of a picked option as the next run and `spec.md` see it: `Ansatz B: <Titel> — Anmerkung: <note>`. */
export function choiceAnswerText(option: Pick<ChoiceOption, 'id' | 'title'>, note?: string): string {
  const base = `Ansatz ${option.id}: ${option.title.trim()}`
  const trimmedNote = note?.trim()
  return trimmedNote ? `${base} — Anmerkung: ${trimmedNote}` : base
}

/**
 * Question text of a choice as the next run and `spec.md` see it: the question plus the offered options, so a fresh
 * run still knows the options that were not picked, e.g. `Wo? (Angeboten: A: Beim Speichern; B: Beim Lesen)`.
 * Whitespace and line breaks are collapsed to plain one-line text.
 */
export function choiceQuestionText(choice: Pick<ChoiceOutput, 'question' | 'options'>): string {
  const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const offered = choice.options.map((option) => `${option.id}: ${oneLine(option.title)}`).join('; ')
  return `${oneLine(choice.question)} (Angeboten: ${offered})`
}

/** What `answerQuestion` continues with: the run that asked, the new Q&A history and the logged answer. */
export interface AnswerPlan {
  /** The latest run of the stage; its output is the open question or choice. */
  questionRun: AgentRun
  /** Q&A history of the question run plus the new answer. */
  answeredQuestions: QAPair[]
  /** Answer text as the next run and the artifact see it. */
  answer: string
  /** Picked option when the open question was a choice. */
  choice?: ChoiceId
}

/**
 * Finds the open question or choice and builds the Q&A history for the answer run.
 * Only the latest run counts: a question followed by another run is no longer open.
 * @param runs  - Runs of one ticket and stage in `seq` order.
 * @param input - The human's answer (`{ answer }`) or pick (`{ choice, note? }`).
 * @returns null when nothing is open.
 * @throws {ValidationError} when the input does not fit the open question (answer for a choice, pick for a question,
 *   id that was not offered).
 */
export function planAnswerRun(runs: AgentRun[], input: AnswerInput): AnswerPlan | null {
  const latest = runs[runs.length - 1]
  const output = latest?.output
  if (!latest || (output?.type !== 'question' && output?.type !== 'choice')) {
    return null
  }
  const { answer, choice } = answerFor(output, input)
  const question = output.type === 'choice' ? choiceQuestionText(output) : output.question
  const answeredQuestions = [...latest.input.answeredQuestions, { question, answer }]
  return choice ? { questionRun: latest, answeredQuestions, answer, choice } : { questionRun: latest, answeredQuestions, answer }
}

/** Answer text (and picked id) for the open question or choice. @throws {ValidationError} */
function answerFor(output: QuestionOutput | ChoiceOutput, input: AnswerInput): { answer: string; choice?: ChoiceId } {
  if (output.type === 'question') {
    if (!('answer' in input)) {
      throw new ValidationError('Die offene Rückfrage erwartet eine Antwort, keine Auswahl')
    }
    return { answer: input.answer }
  }
  if (!('choice' in input)) {
    throw new ValidationError('Bitte einen der angebotenen Ansätze wählen')
  }
  const option = output.options.find((candidate) => candidate.id === input.choice)
  if (!option) {
    throw new ValidationError(`Ansatz ${input.choice} wurde nicht angeboten`)
  }
  return { answer: choiceAnswerText(option, input.note), choice: option.id }
}
