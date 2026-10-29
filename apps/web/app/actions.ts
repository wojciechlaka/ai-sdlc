'use server'

import { revalidatePath } from 'next/cache'
import type { StartupReport } from '@refinement/core'
import { getEngine } from '@/lib/container'
import { runAction, type ActionResult } from '@/lib/actionResult'

/** Board and ticket pages both show ticket state — refresh the whole tree. */
function refreshAll(): void {
  revalidatePath('/', 'layout')
}

/** Starts the ticket's current stage with the chosen model; the agent runs in the background. */
export async function startStageAction(ticketKey: string, input: { model: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().startStage(ticketKey, input))
  refreshAll()
  return result
}

/** Answers the agent's open question; the stage continues in a new run. */
export async function answerQuestionAction(ticketKey: string, input: { answer: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().answerQuestion(ticketKey, input))
  refreshAll()
  return result
}

/** Stops the running agent and returns the ticket to `ready`. */
export async function stopRunAction(ticketKey: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().stopRun(ticketKey))
  refreshAll()
  return result
}

/** Resets database and target repo; the result carries the startup warnings. */
export async function resetSystemAction(): Promise<ActionResult<StartupReport>> {
  const result = await runAction(() => getEngine().resetSystem())
  refreshAll()
  return result
}
