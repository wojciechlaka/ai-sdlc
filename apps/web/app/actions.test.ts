// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictError } from '@refinement/core'

const engine = vi.hoisted(() => ({
  startStage: vi.fn(),
  answerQuestion: vi.fn(),
  stopRun: vi.fn(),
  resetSystem: vi.fn(),
}))

vi.mock('@/lib/container', () => ({ getEngine: () => engine }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { answerQuestionAction, resetSystemAction, startStageAction, stopRunAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server actions', () => {
  it('passes key and input through and refreshes the whole layout', async () => {
    expect(await startStageAction('CB-2', { model: 'm' })).toEqual({ ok: true, data: undefined })
    await answerQuestionAction('CB-2', { answer: 'Alle Leser' })
    await stopRunAction('CB-2')
    expect(engine.startStage).toHaveBeenCalledWith('CB-2', { model: 'm' })
    expect(engine.answerQuestion).toHaveBeenCalledWith('CB-2', { answer: 'Alle Leser' })
    expect(engine.stopRun).toHaveBeenCalledWith('CB-2')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('awaits the reset', async () => {
    engine.resetSystem.mockResolvedValue(undefined)
    expect(await resetSystemAction()).toEqual({ ok: true, data: undefined })
  })

  it('reports domain errors as a failed result', async () => {
    engine.startStage.mockImplementation(() => {
      throw new ConflictError('GITHUB_TOKEN fehlt')
    })
    expect(await startStageAction('CB-2', { model: 'm' })).toEqual({ ok: false, error: 'GITHUB_TOKEN fehlt' })
  })
})
