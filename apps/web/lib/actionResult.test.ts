// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ConflictError, NotFoundError, ValidationError } from '@refinement/core'
import { runAction } from './actionResult'

describe('runAction', () => {
  it('wraps the return value', async () => {
    expect(await runAction(() => 42)).toEqual({ ok: true, data: 42 })
    expect(await runAction(async () => 'x')).toEqual({ ok: true, data: 'x' })
  })

  it('turns domain errors into a failed result with the message', async () => {
    for (const err of [new ConflictError('busy'), new NotFoundError('gone'), new ValidationError('bad')]) {
      expect(await runAction(() => { throw err })).toEqual({ ok: false, error: err.message })
    }
  })

  it('rethrows unexpected errors', async () => {
    await expect(runAction(() => { throw new Error('db down') })).rejects.toThrow('db down')
  })
})
