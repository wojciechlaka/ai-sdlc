import type { AuditLogEntryDto } from '@refinement/shared'
import { formatDateTime } from '@/lib/format'
import { describeLogEvent, groupLogEntries } from '@/lib/logFormat'

const ACTOR_LABEL: Record<AuditLogEntryDto['actor'], string> = { human: 'Mensch', agent: 'Agent', system: 'System' }

/** Timestamp column of a log row. */
function Time({ at }: { at: Date }) {
  return (
    <time className="shrink-0 font-mono text-slate-400" dateTime={at.toISOString()}>
      {formatDateTime(at)}
    </time>
  )
}

/** Actor column of a log row (Mensch, Agent, System). */
function Actor({ actor }: { actor: AuditLogEntryDto['actor'] }) {
  return <span className="w-12 shrink-0 text-slate-500">{ACTOR_LABEL[actor]}</span>
}

/** Consecutive tool calls of the agent as one collapsible row, timed and attributed like their first call. */
function ToolCallsRow({ events }: { events: AuditLogEntryDto[] }) {
  const first = events[0]!
  return (
    <li className="flex gap-3 text-xs">
      <Time at={first.createdAt} />
      <Actor actor={first.actor} />
      <details className="min-w-0 text-slate-500">
        <summary className="cursor-pointer select-none">
          {events.length} {events.length === 1 ? 'Werkzeugaufruf' : 'Werkzeugaufrufe'}
        </summary>
        <ol className="mt-1 space-y-0.5">
          {events.map((event, i) => (
            <li key={i} className="flex gap-3">
              <Time at={event.createdAt} />
              <span className="break-all font-mono text-slate-600">{describeLogEvent(event)}</span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  )
}

/** One log entry; a call blocked by the guard is highlighted. */
function EventRow({ event }: { event: AuditLogEntryDto }) {
  const blocked = event.type === 'guard_blocked'
  return (
    <li className="flex gap-3 text-xs" data-blocked={blocked ? 'true' : undefined}>
      <Time at={event.createdAt} />
      <Actor actor={event.actor} />
      <span className={blocked ? 'break-all font-medium text-red-700' : 'text-slate-700'}>{describeLogEvent(event)}</span>
    </li>
  )
}

/**
 * Persistent log of the ticket, oldest first. Consecutive tool calls of the agent are collapsed into one row
 * (`<details>`, no client state, so it stays a server component); calls blocked by the guard are highlighted.
 */
export function LogList({ log }: { log: AuditLogEntryDto[] }) {
  if (log.length === 0) {
    return <p className="text-xs text-slate-400">Noch keine Einträge.</p>
  }
  return (
    <ol className="space-y-1">
      {groupLogEntries(log).map((row, index) =>
        row.kind === 'tools' ? <ToolCallsRow key={index} events={row.events} /> : <EventRow key={index} event={row.event} />,
      )}
    </ol>
  )
}
