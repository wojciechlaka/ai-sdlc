'use server'

import { revalidatePath } from 'next/cache'
import { getEngine } from '@/lib/container'
import { runAction, type ActionResult } from '@/lib/actionResult'

/** Board and ticket pages both show ticket state — refresh the whole tree. */
function refreshAll(): void {
  revalidatePath('/', 'layout')
}

export async function startStageAction(key: string, input: { model: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().startStage(key, input))
  refreshAll()
  return result
}

export async function answerQuestionAction(key: string, input: { answer: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().answerQuestion(key, input))
  refreshAll()
  return result
}

export async function stopRunAction(key: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().stopRun(key))
  refreshAll()
  return result
}

export async function resetSystemAction(): Promise<ActionResult> {
  const result = await runAction(() => getEngine().resetSystem())
  refreshAll()
  return result
}
