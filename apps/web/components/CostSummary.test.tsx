import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { NO_STAGE_COST, aCostSummary } from '@/test/fixtures'
import { CostSummary, describeStageCost } from './CostSummary'

describe('CostSummary', () => {
  it('shows each stage and the total; a stage without runs shows a dash', () => {
    render(<CostSummary costs={aCostSummary({
      totalUsd: 0.09, runs: 3, inputTokens: 12_300, outputTokens: 1_200,
      byStage: { plan: { usd: 0.09, runs: 3, inputTokens: 12_300, outputTokens: 1_200 }, design: NO_STAGE_COST },
    })} />)

    const block = within(screen.getByRole('group', { name: 'Kosten' }))
    expect(block.getByText('1 Plan · Intent: $0.09 · 3 Läufe · 12.3K↑ 1.2K↓')).toBeInTheDocument()
    expect(block.getByText('2 Design · Spec: —')).toBeInTheDocument()
    expect(block.getByText('Gesamt: $0.09 (3 Läufe)')).toBeInTheDocument()
  })

  it('shows a ticket without runs as zero', () => {
    render(<CostSummary costs={aCostSummary()} />)
    expect(screen.getByText('Gesamt: — (0 Läufe)')).toBeInTheDocument()
  })
})

describe('describeStageCost', () => {
  it('omits tokens when the runs reported no usage', () => {
    expect(describeStageCost({ usd: 0, runs: 1, inputTokens: 0, outputTokens: 0 })).toBe('— · 1 Lauf')
  })
})
