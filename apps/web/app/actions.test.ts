// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictError } from '@refinement/core'

const engine = vi.hoisted(() => ({
  createTicket: vi.fn(),
  startRefinement: vi.fn(),
  answerQuestion: vi.fn(),
  stopRefinement: vi.fn(),
  deleteTicket: vi.fn(),
  resetSystem: vi.fn(),
}))

vi.mock('@/lib/container', () => ({ getEngine: () => engine }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import {
  createTicketAction,
  startRefinementAction,
  answerQuestionAction,
  stopRefinementAction,
  deleteTicketAction,
  resetSystemAction,
} from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server actions', () => {
  it('createTicketAction returns the ticket and refreshes the whole layout', async () => {
    engine.createTicket.mockReturnValue({ id: 'T-4', title: 'Neu' })
    const result = await createTicketAction({ title: 'Neu', description: 'D' })
    expect(result).toEqual({ ok: true, data: { id: 'T-4', title: 'Neu' } })
    expect(engine.createTicket).toHaveBeenCalledWith({ title: 'Neu', description: 'D' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('passes ticket id and input through to the use cases', async () => {
    const input = { repo: 'https://github.com/x/y', model: 'm', acceptanceCriteria: '' }
    await startRefinementAction('T-1', input)
    await answerQuestionAction('T-1', { answer: 'Postgres' })
    await deleteTicketAction('T-2')
    expect(engine.startRefinement).toHaveBeenCalledWith('T-1', input)
    expect(engine.answerQuestion).toHaveBeenCalledWith('T-1', { answer: 'Postgres' })
    expect(engine.deleteTicket).toHaveBeenCalledWith('T-2')
  })

  it('awaits the asynchronous use cases', async () => {
    engine.stopRefinement.mockResolvedValue(undefined)
    engine.resetSystem.mockResolvedValue([{ id: 'T-1' }])
    expect(await stopRefinementAction('T-1')).toEqual({ ok: true, data: undefined })
    expect(await resetSystemAction()).toEqual({ ok: true, data: [{ id: 'T-1' }] })
  })

  it('reports domain errors as a failed result', async () => {
    engine.startRefinement.mockImplementation(() => {
      throw new ConflictError('Ticket is not in a refineable state')
    })
    const result = await startRefinementAction('T-1', { repo: 'r', model: 'm', acceptanceCriteria: '' })
    expect(result).toEqual({ ok: false, error: 'Ticket is not in a refineable state' })
  })
})
