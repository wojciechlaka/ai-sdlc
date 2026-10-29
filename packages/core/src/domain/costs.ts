import { AuditEventSchema, runInputTokens, type AuditPayloads, type CostSummaryDto, type StageCostDto } from '@refinement/shared'
import type { ArtifactStage } from './types'

/** A stored log entry as far as the cost summary needs it; the payload is parsed here. */
export interface CostLogEntry {
  type: string
  payload: unknown
}

/** Stage of a run that has no `run_started` entry in the log, e.g. from the AgentRun row. */
export type RunStageLookup = (runId: string) => ArtifactStage | null

const noCost = (): StageCostDto => ({ usd: 0, runs: 0, inputTokens: 0, outputTokens: 0 })

/** Adds one run; input tokens follow `runInputTokens` (uncached input plus cache writes, as in the log line). */
function addRun(target: StageCostDto, run: AuditPayloads['run_finished']): void {
  target.usd += run.costUsd ?? 0
  target.runs += 1
  target.inputTokens += runInputTokens(run)
  target.outputTokens += run.outputTokens ?? 0
}

/**
 * Agent cost of a ticket from its log: one `run_finished` entry per run. Succeeded runs and discarded results
 * (`verworfen`) carry usage; runs that ended without a Claude result (stop, restart, error, timeout) count as runs
 * with cost 0. The cost is the one the Claude CLI reported (`total_cost_usd`), not the web's price-list estimate.
 * The stage comes from the run's `run_started` entry, else from `stageOfRun`; a run whose stage is unknown counts
 * only in the totals. Entries that do not match the current contract (old rows) are skipped.
 */
export function summarizeCosts(entries: readonly CostLogEntry[], stageOfRun: RunStageLookup = () => null): CostSummaryDto {
  const startedStage = new Map<string, ArtifactStage>()
  const finished: AuditPayloads['run_finished'][] = []
  for (const entry of entries) {
    const parsed = AuditEventSchema.safeParse(entry)
    if (!parsed.success) {
      continue
    }
    if (parsed.data.type === 'run_started') {
      startedStage.set(parsed.data.payload.runId, parsed.data.payload.stage)
    } else if (parsed.data.type === 'run_finished') {
      finished.push(parsed.data.payload)
    }
  }

  const total = noCost()
  const byStage: Record<ArtifactStage, StageCostDto> = { plan: noCost(), design: noCost() }
  for (const run of finished) {
    addRun(total, run)
    const stage = startedStage.get(run.runId) ?? stageOfRun(run.runId)
    if (stage) {
      addRun(byStage[stage], run)
    }
  }
  return {
    totalUsd: total.usd,
    runs: total.runs,
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    byStage,
  }
}
