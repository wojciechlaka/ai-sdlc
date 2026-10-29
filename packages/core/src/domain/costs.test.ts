import { describe, it, expect } from 'vitest'
import { summarizeCosts, type CostLogEntry } from './costs'

const started = (runId: string, stage: 'plan' | 'design'): CostLogEntry => ({
  type: 'run_started', payload: { runId, stage, trigger: 'initial', model: 'm' },
})

const usage = (costUsd: number, inputTokens: number, cacheCreationTokens: number, outputTokens: number) => ({
  model: 'm', durationSeconds: 10, costUsd, inputTokens, cacheCreationTokens, cacheReadTokens: 50_000, outputTokens,
})

const finished = (runId: string, payload: Record<string, unknown> = {}): CostLogEntry => ({
  type: 'run_finished', payload: { runId, status: 'succeeded', ...payload },
})

const NO_COST = { usd: 0, runs: 0, inputTokens: 0, outputTokens: 0 }

describe('summarizeCosts', () => {
  it('is all zeros without runs', () => {
    expect(summarizeCosts([{ type: 'ticket_imported', payload: { sourcePath: 'x.md' } }])).toEqual({
      totalUsd: 0, runs: 0, inputTokens: 0, outputTokens: 0, byStage: { plan: NO_COST, design: NO_COST },
    })
  })

  it('sums runs per stage and in total; input is uncached input plus cache writes, cache reads left out', () => {
    const summary = summarizeCosts([
      started('r1', 'plan'), finished('r1', usage(0.05, 100, 10_000, 800)),
      started('r2', 'plan'), finished('r2', usage(0.04, 200, 2_000, 400)),
      started('r3', 'design'), finished('r3', usage(0.02, 50, 1_000, 300)),
    ])

    expect(summary.byStage.plan).toEqual({ usd: expect.closeTo(0.09), runs: 2, inputTokens: 12_300, outputTokens: 1_200 })
    expect(summary.byStage.design).toEqual({ usd: 0.02, runs: 1, inputTokens: 1_050, outputTokens: 300 })
    expect(summary).toMatchObject({ runs: 3, inputTokens: 13_350, outputTokens: 1_500 })
    expect(summary.totalUsd).toBeCloseTo(0.11)
  })

  it('counts a discarded result with its usage and a failed run without usage as a run with cost 0', () => {
    const summary = summarizeCosts([
      started('r1', 'plan'), finished('r1', { status: 'failed', reason: 'verworfen', ...usage(0.03, 10, 90, 20) }),
      started('r2', 'plan'), finished('r2', { status: 'failed', reason: 'Neustart' }),
      started('r3', 'plan'), finished('r3', { status: 'timeout' }),
    ])

    expect(summary.byStage.plan).toEqual({ usd: 0.03, runs: 3, inputTokens: 100, outputTokens: 20 })
    expect(summary.totalUsd).toBe(0.03)
  })

  it('takes the stage from the lookup when the log has no run_started entry', () => {
    const summary = summarizeCosts([finished('r1', usage(0.01, 1, 0, 1))], (runId) => (runId === 'r1' ? 'design' : null))
    expect(summary.byStage.design).toMatchObject({ usd: 0.01, runs: 1 })
  })

  it('counts a run of unknown stage only in the totals and skips entries that do not match the contract', () => {
    const summary = summarizeCosts([
      finished('r1', usage(0.01, 1, 0, 1)),
      { type: 'run_finished', payload: { costUsd: 9 } },
    ])
    expect(summary).toMatchObject({ totalUsd: 0.01, runs: 1, byStage: { plan: NO_COST, design: NO_COST } })
  })
})
