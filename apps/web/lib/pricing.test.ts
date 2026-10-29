import { describe, it, expect } from 'vitest'
import { runCostUsd } from './pricing'

describe('runCostUsd', () => {
  const RUN = { runId: 'r1', status: 'succeeded' } as const

  it('uses the reported cost', () => {
    expect(runCostUsd({ ...RUN, costUsd: 0.5 })).toBe(0.5)
  })

  it('estimates the cost from the model table when none was reported', () => {
    expect(runCostUsd({ ...RUN, costUsd: 0, model: 'claude-sonnet-4-6', inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3)
    expect(runCostUsd({
      ...RUN, model: 'claude-sonnet-4-6', cacheCreationTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000,
    })).toBeCloseTo(3 * 1.25 + 3 * 0.1 + 15)
  })

  it('is 0 for a model not in the table', () => {
    expect(runCostUsd({ ...RUN, costUsd: 0, model: 'unknown' })).toBe(0)
    expect(runCostUsd({ ...RUN, model: 'toString' })).toBe(0)
  })
})
