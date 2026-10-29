import { AuditEventSchema, type AuditLogEntryDto, type AuditPayloads, type Stage } from '@refinement/shared'
import { STAGE_LABEL } from './constants'
import { formatCost, formatElapsed, formatTokens } from './format'
import { modelLabel } from './models'
import { runCostUsd } from './pricing'

const stageLabel = (stage: Stage) => STAGE_LABEL[stage] ?? stage

/** Tool call with its target; Bash commands in backticks. */
function toolCall({ tool, target }: { tool: string; target: string }): string {
  if (!target) return tool
  return tool === 'Bash' ? `${tool} \`${target}\`` : `${tool} ${target}`
}

/** Tokens and cost of a run, or '' when the run has no usage (stop, restart, error before Claude answered). */
function runUsage(run: AuditPayloads['run_finished']): string {
  const inputTokens = run.inputTokens ?? 0
  if (inputTokens === 0) return ''
  const tokensIn = inputTokens + (run.cacheCreationTokens ?? 0)
  return ` · ${formatTokens(tokensIn)}↑ ${formatTokens(run.outputTokens ?? 0)}↓ · ${formatCost(runCostUsd(run))}`
}

/** German line for a finished run: timeout, failure (with reason) or success (with duration). */
function describeRunFinished(run: AuditPayloads['run_finished']): string {
  const usage = runUsage(run)
  if (run.status === 'timeout') return `Agent-Zeitlimit überschritten${usage}`
  if (run.status !== 'succeeded') return `Agent-Lauf fehlgeschlagen${run.reason ? ` (${run.reason})` : ''}${usage}`
  return `Agent fertig in ${formatElapsed(run.durationSeconds ?? 0)}${usage}`
}

/**
 * One German line per log entry. Entries that do not match the contract (unknown type, rows of an older version)
 * fall back to the type name instead of breaking the page.
 */
export function describeLogEvent(entry: AuditLogEntryDto): string {
  const parsed = AuditEventSchema.safeParse(entry)
  if (!parsed.success) return entry.type
  const event = parsed.data
  switch (event.type) {
    case 'ticket_imported':
      return `Ticket übernommen aus ${event.payload.sourcePath}`
    case 'run_started': {
      const { stage, model, trigger } = event.payload
      return `Agent gestartet (${stageLabel(stage)}, ${modelLabel(model)}${trigger === 'answer' ? ', mit Antwort' : ''})`
    }
    case 'run_finished':
      return describeRunFinished(event.payload)
    case 'question_asked':
      return `Rückfrage: ${event.payload.question}`
    case 'answer_given':
      return `Antwort: ${event.payload.answer}`
    case 'pr_opened':
      return `PR #${event.payload.prNumber} geöffnet (${event.payload.branch})`
    case 'pr_merged':
      return `PR #${event.payload.prNumber} gemergt`
    case 'pr_closed':
      return `PR #${event.payload.prNumber} ohne Merge geschlossen`
    case 'stage_changed':
      return `Stufe ${stageLabel(event.payload.from)} → ${stageLabel(event.payload.to)}`
    case 'cleanup':
      return `Beim Start aufgeräumt: PR #${event.payload.prNumber} geschlossen, Branch ${event.payload.branch} gelöscht`
    case 'error':
      return `Fehler: ${event.payload.message}`
    case 'guard_blocked':
      return `Blockiert: ${toolCall(event.payload)}${event.payload.reason ? ` — ${event.payload.reason}` : ''}`
    case 'tool_used':
      return toolCall(event.payload)
  }
}

/** A row of the ticket log: one entry, or consecutive `tool_used` entries shown as one collapsible row. */
export type LogRow = { kind: 'event'; event: AuditLogEntryDto } | { kind: 'tools'; events: AuditLogEntryDto[] }

/** Groups consecutive `tool_used` entries so the log stays readable; everything else stays a row of its own. */
export function groupLogEntries(log: AuditLogEntryDto[]): LogRow[] {
  const rows: LogRow[] = []
  for (const event of log) {
    const last = rows.at(-1)
    if (event.type !== 'tool_used') rows.push({ kind: 'event', event })
    else if (last?.kind === 'tools') last.events.push(event)
    else rows.push({ kind: 'tools', events: [event] })
  }
  return rows
}
