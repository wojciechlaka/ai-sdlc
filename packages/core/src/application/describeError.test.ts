import { describe, it, expect } from 'vitest'
import { describeError } from './describeError'

describe('describeError', () => {
  it('prefers stderr', () => {
    expect(describeError({ stderr: Buffer.from(' boom \n') })).toBe('boom')
  })

  it('falls back to message and String()', () => {
    expect(describeError(new Error('x'))).toBe('x')
    expect(describeError('y')).toBe('y')
  })

  it('redacts credentials in URLs', () => {
    const err = new Error('fatal: https://ghp_secret123@github.com/a/b failed')
    expect(describeError(err)).toBe('fatal: https://***@github.com/a/b failed')
    expect(describeError({ stderr: Buffer.from('https://u:p@host/x') })).toBe('https://***@host/x')
  })
})
