import type { AuditEventDto, Stage } from '@refinement/shared'
import { CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, MODELS, MODEL_PRICING, MTOK, STAGE_LABEL } from './constants'
import { formatElapsed } from './utils'

const TOKENS_PER_K = 1000

type Payload = Record<string, unknown>

const text = (p: Payload, key: string) => (p[key] === undefined || p[key] === null ? '' : String(p[key]))
const count = (p: Payload, key: string) => (typeof p[key] === 'number' ? (p[key] as number) : 0)
const modelLabel = (model: string) => MODELS.find((m) => m.value === model)?.label ?? model
const stageLabel = (stage: string) => STAGE_LABEL[stage as Stage] ?? stage

/** 1500 → "1.5K" */
export function formatTokens(n: number): string {
  if (n < TOKENS_PER_K) return String(n)
  const k = n / TOKENS_PER_K
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
}

/** Cost of a run: the reported value, otherwise estimated from the pricing table; 0 if unknown. */
export function runCostUsd(p: Payload): number {
  const reported = count(p, 'costUsd')
  if (reported > 0) return reported
  const pricing = MODEL_PRICING[text(p, 'model')]
  if (!pricing) return 0
  return (count(p, 'inputTokens') / MTOK) * pricing.inputPerMtok
    + (count(p, 'cacheCreationTokens') / MTOK) * pricing.inputPerMtok * CACHE_WRITE_MULTIPLIER
    + (count(p, 'cacheReadTokens') / MTOK) * pricing.inputPerMtok * CACHE_READ_MULTIPLIER
    + (count(p, 'outputTokens') / MTOK) * pricing.outputPerMtok
}

export function formatCost(usd: number): string {
  if (usd === 0) return '—'
  return `$${usd < 0.001 ? usd.toFixed(6) : usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
}

/** One German line per log entry; unknown types fall back to the type name. */
export function describeLogEvent(event: AuditEventDto): string {
  const p = (event.payload ?? {}) as Payload
  switch (event.type) {
    case 'ticket_imported':
      return `Ticket übernommen aus ${text(p, 'sourcePath')}`
    case 'run_started':
      return `Agent gestartet (${stageLabel(text(p, 'stage'))}, ${modelLabel(text(p, 'model'))}${p.trigger === 'answer' ? ', mit Antwort' : ''})`
    case 'run_finished': {
      const tokensIn = count(p, 'inputTokens') + count(p, 'cacheCreationTokens')
      const usage = count(p, 'inputTokens') > 0
        ? ` · ${formatTokens(tokensIn)}↑ ${formatTokens(count(p, 'outputTokens'))}↓ · ${formatCost(runCostUsd(p))}`
        : ''
      if (p.status === 'timeout') return `Agent-Zeitlimit überschritten${usage}`
      if (p.status !== 'succeeded') return `Agent-Lauf fehlgeschlagen${p.reason ? ` (${text(p, 'reason')})` : ''}${usage}`
      return `Agent fertig in ${formatElapsed(count(p, 'durationSeconds'))}${usage}`
    }
    case 'question_asked':
      return `Rückfrage: ${text(p, 'question')}`
    case 'answer_given':
      return `Antwort: ${text(p, 'answer')}`
    case 'pr_opened':
      return `PR #${count(p, 'prNumber')} geöffnet (${text(p, 'branch')})`
    case 'pr_merged':
      return `PR #${count(p, 'prNumber')} gemergt`
    case 'pr_closed':
      return `PR #${count(p, 'prNumber')} ohne Merge geschlossen`
    case 'stage_changed':
      return `Stufe ${stageLabel(text(p, 'from'))} → ${stageLabel(text(p, 'to'))}`
    case 'cleanup':
      return `Beim Start aufgeräumt: PR #${count(p, 'prNumber')} geschlossen, Branch ${text(p, 'branch')} gelöscht`
    case 'error':
      return `Fehler: ${text(p, 'message')}`
    default:
      return event.type
  }
}
