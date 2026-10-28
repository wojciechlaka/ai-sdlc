import type { AuditEventDto } from '@refinement/shared'
import { describeLogEvent } from '@/lib/logFormat'

const ACTOR_LABEL: Record<AuditEventDto['actor'], string> = { human: 'Mensch', agent: 'Agent', system: 'System' }
const TIME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Berlin' })

/** Persistent log of the ticket, oldest first. */
export function LogList({ log }: { log: AuditEventDto[] }) {
  if (log.length === 0) return <p className="text-xs text-slate-400">Noch keine Einträge.</p>
  return (
    <ol className="space-y-1">
      {log.map((event, index) => (
        <li key={index} className="flex gap-3 text-xs">
          <time className="shrink-0 font-mono text-slate-400" dateTime={event.createdAt.toISOString()}>
            {TIME.format(event.createdAt)}
          </time>
          <span className="w-12 shrink-0 text-slate-500">{ACTOR_LABEL[event.actor]}</span>
          <span className="text-slate-700">{describeLogEvent(event)}</span>
        </li>
      ))}
    </ol>
  )
}
