import { describe, it, expect } from 'vitest'
import { NotFoundError, ConflictError, ValidationError, errorCode, describeError } from './errors'

describe('domain errors', () => {
  it('carry a stable code and their message', () => {
    expect(new NotFoundError('x').code).toBe('NOT_FOUND')
    expect(new ConflictError('x').code).toBe('CONFLICT')
    expect(new ValidationError('bad').message).toBe('bad')
  })
})

describe('errorCode', () => {
  it('returns the code of domain errors', () => {
    expect(errorCode(new NotFoundError('x'))).toBe('NOT_FOUND')
    expect(errorCode(new ConflictError('x'))).toBe('CONFLICT')
    expect(errorCode(new ValidationError('x'))).toBe('VALIDATION')
  })

  it('recognises errors from another module copy by their code field', () => {
    const foreign = Object.assign(new Error('copy'), { code: 'CONFLICT' })
    expect(errorCode(foreign)).toBe('CONFLICT')
  })

  it('returns null for everything else', () => {
    expect(errorCode(new Error('x'))).toBeNull()
    expect(errorCode(Object.assign(new Error('fs'), { code: 'ENOENT' }))).toBeNull()
    expect(errorCode(null)).toBeNull()
    expect(errorCode('string')).toBeNull()
  })
})

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
