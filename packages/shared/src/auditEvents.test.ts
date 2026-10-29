import { describe, it, expect } from 'vitest'
import { AuditEventSchema, runInputTokens } from './auditEvents'

describe('AuditEventSchema', () => {
  it('accepts a payload that matches its type and drops unknown keys', () => {
    const parsed = AuditEventSchema.parse({ type: 'pr_merged', payload: { prNumber: 4, extra: true }, actor: 'human' })
    expect(parsed).toEqual({ type: 'pr_merged', payload: { prNumber: 4 } })
  })

  it('accepts a finished run with and without usage', () => {
    expect(AuditEventSchema.safeParse({ type: 'run_finished', payload: { runId: 'r', status: 'failed' } }).success).toBe(true)
    const withUsage = { runId: 'r', status: 'succeeded', model: 'm', costUsd: 0.1, inputTokens: 5, outputTokens: 2 }
    expect(AuditEventSchema.safeParse({ type: 'run_finished', payload: withUsage }).success).toBe(true)
  })

  it('rejects unknown types and payloads of another type', () => {
    expect(AuditEventSchema.safeParse({ type: 'something_new', payload: {} }).success).toBe(false)
    expect(AuditEventSchema.safeParse({ type: 'pr_merged', payload: { message: 'x' } }).success).toBe(false)
    expect(AuditEventSchema.safeParse({ type: 'error', payload: null }).success).toBe(false)
  })
})

describe('runInputTokens', () => {
  it('counts uncached input plus cache writes, not cache reads; missing usage is 0', () => {
    expect(runInputTokens({ runId: 'r', status: 'succeeded', inputTokens: 100, cacheCreationTokens: 900, cacheReadTokens: 50_000 })).toBe(1000)
    expect(runInputTokens({ runId: 'r', status: 'failed' })).toBe(0)
  })
})
