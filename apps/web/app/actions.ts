'use server'

import { revalidatePath } from 'next/cache'
import type { TicketDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { runAction, type ActionResult } from '@/lib/actionResult'

/** The sidebar list and the ticket pages both show ticket state — refresh the whole tree. */
function refreshAll(): void {
  revalidatePath('/', 'layout')
}

export async function createTicketAction(
  input: { title: string; description: string },
): Promise<ActionResult<TicketDto>> {
  const result = await runAction(() => getEngine().createTicket(input))
  refreshAll()
  return result
}

export async function startRefinementAction(
  ticketId: string,
  input: { repo: string; model: string; acceptanceCriteria: string },
): Promise<ActionResult> {
  const result = await runAction(() => getEngine().startRefinement(ticketId, input))
  refreshAll()
  return result
}

export async function answerQuestionAction(ticketId: string, input: { answer: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().answerQuestion(ticketId, input))
  refreshAll()
  return result
}

export async function stopRefinementAction(ticketId: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().stopRefinement(ticketId))
  refreshAll()
  return result
}

export async function deleteTicketAction(ticketId: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().deleteTicket(ticketId))
  refreshAll()
  return result
}

export async function resetSystemAction(): Promise<ActionResult<TicketDto[]>> {
  const result = await runAction(() => getEngine().resetSystem())
  refreshAll()
  return result
}
