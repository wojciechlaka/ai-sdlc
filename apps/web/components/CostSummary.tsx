import { ArtifactStageSchema, type CostSummaryDto, type StageCostDto } from '@refinement/shared'
import { ARTIFACT_STAGE_TITLE } from '@/lib/constants'
import { formatCost, formatRuns, formatTokens } from '@/lib/format'

/** "$0.09 · 3 Läufe · 12.3K↑ 1.2K↓"; "—" for a stage without runs; tokens only when a run reported usage. */
export function describeStageCost(cost: StageCostDto): string {
  if (cost.runs === 0) {
    return '—'
  }
  const parts = [formatCost(cost.usd), formatRuns(cost.runs)]
  if (cost.inputTokens > 0 || cost.outputTokens > 0) {
    parts.push(`${formatTokens(cost.inputTokens)}↑ ${formatTokens(cost.outputTokens)}↓`)
  }
  return parts.join(' · ')
}

/**
 * Agent cost of a ticket per stage and in total, as the Claude CLI reported it (the log lines may show a price-list
 * estimate where the CLI reported none). Server component.
 */
export function CostSummary({ costs }: { costs: CostSummaryDto }) {
  return (
    <div role="group" aria-label="Kosten" className="space-y-1 rounded-lg border border-slate-200 p-3 text-xs">
      <h3 className="font-semibold text-slate-600">Kosten</h3>
      <ul className="space-y-0.5 text-slate-600">
        {ArtifactStageSchema.options.map((stage) => (
          <li key={stage}>
            {ARTIFACT_STAGE_TITLE[stage]}: {describeStageCost(costs.byStage[stage])}
          </li>
        ))}
      </ul>
      <p className="font-semibold">
        Gesamt: {formatCost(costs.totalUsd)} ({formatRuns(costs.runs)})
      </p>
    </div>
  )
}
