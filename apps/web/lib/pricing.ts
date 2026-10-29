import type { AuditPayloads } from '@refinement/shared'
import { modelInfo } from './models'

/** Prices are quoted per million tokens. */
const TOKENS_PER_MILLION = 1_000_000
/** Price factor of cache writes relative to the input price. */
const CACHE_WRITE_MULTIPLIER = 1.25
/** Price factor of cache reads relative to the input price. */
const CACHE_READ_MULTIPLIER = 0.10

/** Cost of a run: the reported value, otherwise estimated from the model table; 0 if unknown. */
export function runCostUsd(run: AuditPayloads['run_finished']): number {
  const reported = run.costUsd ?? 0
  if (reported > 0) {
    return reported
  }
  const model = modelInfo(run.model)
  if (!model) {
    return 0
  }
  const millions = (tokens: number | undefined) => (tokens ?? 0) / TOKENS_PER_MILLION
  return millions(run.inputTokens) * model.inputPerMtok
    + millions(run.cacheCreationTokens) * model.inputPerMtok * CACHE_WRITE_MULTIPLIER
    + millions(run.cacheReadTokens) * model.inputPerMtok * CACHE_READ_MULTIPLIER
    + millions(run.outputTokens) * model.outputPerMtok
}
