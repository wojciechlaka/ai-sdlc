import type { ReactNode } from 'react'
import type { Ticket } from '../api/ticketApi'
import { MODEL_PRICING, MTOK, CACHE_WRITE_MULTIPLIER, CACHE_READ_MULTIPLIER } from '../api/ticketApi'
import { ModelSelect } from './ModelSelect'
import { formatElapsed } from '../lib/utils'

interface Props {
  model: string
  canRefine: boolean
  onModelChange: (model: string) => void
  durationSeconds?: number
  latestRun?: NonNullable<Ticket['latestRun']>
  refinementOutput?: RefinementResult | null
}
type RefinementResult = Extract<NonNullable<NonNullable<Ticket['latestRun']>['output']>, { type: 'refinement' }>['result']
const TOKENS_PER_K = 1000

/** Single label/value pair in the metadata row. */
function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{label}:</span>
      <span className="text-xs text-slate-700 font-mono">{children}</span>
    </div>
  )
}

/** Formats a token count as a compact string, e.g. 1500 → "1.5K". */
function formatTokens(n: number) {
  if (n < TOKENS_PER_K) return String(n)
  const k = n / TOKENS_PER_K
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
}

/**
 * Displays the cost of an agent run. Uses the reported `costUsd` from the CLI if available,
 * otherwise estimates from the model pricing table and token counts.
 * @param run   - The agent run to display cost for.
 * @param model - Claude model identifier, used for pricing lookup.
 */
function CostDisplay({ run, model }: { run: NonNullable<Ticket['latestRun']>; model: string }) {
  const cost = (() => {
    if (run.costUsd !== undefined && run.costUsd !== null && run.costUsd > 0) return run.costUsd
    const pricing = MODEL_PRICING[model]
    if (!pricing || run.inputTokens == null || run.outputTokens == null) return undefined
    return (run.inputTokens / MTOK) * pricing.inputPerMtok
         + ((run.cacheCreationTokens ?? 0) / MTOK) * pricing.inputPerMtok * CACHE_WRITE_MULTIPLIER
         + ((run.cacheReadTokens ?? 0) / MTOK) * pricing.inputPerMtok * CACHE_READ_MULTIPLIER
         + (run.outputTokens / MTOK) * pricing.outputPerMtok
  })()
  if (cost === undefined || cost === 0) return <span>—</span>
  return <span>${cost < 0.001 ? cost.toFixed(6) : cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}</span>
}

/**
 * Metadata row shown below the ticket title: model selector, run duration, token usage, cost, and confidence.
 * @param model           - Currently selected Claude model.
 * @param canRefine       - Whether the model selector should be enabled.
 * @param onModelChange   - Callback when the model is changed.
 * @param durationSeconds - Wall-clock duration of the last run in seconds.
 * @param latestRun       - The latest agent run, used for token and cost display.
 * @param refinementOutput - The refinement result, used for confidence display.
 */
export function TicketMetaRow({ model, canRefine, onModelChange, durationSeconds, latestRun, refinementOutput }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <MetaItem label="Modell">
        <ModelSelect value={model} onChange={onModelChange} disabled={!canRefine} size="sm" />
      </MetaItem>
      {durationSeconds !== undefined && (
        <MetaItem label="Dauer">{formatElapsed(durationSeconds)}</MetaItem>
      )}
      {latestRun?.inputTokens != null && (
        <MetaItem label="Tokenverbrauch">
          {formatTokens((latestRun.inputTokens ?? 0) + (latestRun.cacheCreationTokens ?? 0))}↑
          {' '}{formatTokens(latestRun.outputTokens ?? 0)}↓
        </MetaItem>
      )}
      {latestRun?.inputTokens != null && latestRun && (
        <MetaItem label="Kosten"><CostDisplay run={latestRun} model={model} /></MetaItem>
      )}
      {refinementOutput?.confidence !== undefined && (
        <MetaItem label="Analysequalität">{refinementOutput.confidence}%</MetaItem>
      )}
    </div>
  )
}
