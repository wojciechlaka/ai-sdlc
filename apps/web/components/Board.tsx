import type { Stage, TicketDto } from '@refinement/shared'
import { STAGE_LABEL } from '@/lib/constants'
import { TicketCard } from './TicketCard'

const COLUMNS: readonly Stage[] = ['plan', 'design', 'done']

/** Tickets grouped by playbook stage. */
export function Board({ tickets }: { tickets: TicketDto[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
      {COLUMNS.map((stage) => {
        const column = tickets.filter((ticket) => ticket.stage === stage)
        return (
          <section key={stage} aria-label={STAGE_LABEL[stage]} className="rounded-xl bg-slate-50 p-3">
            <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-600">
              {STAGE_LABEL[stage]}
              <span className="text-xs font-normal text-slate-400">{column.length}</span>
            </h2>
            <div className="space-y-2">
              {column.map((ticket) => <TicketCard key={ticket.key} ticket={ticket} />)}
              {column.length === 0 && <p className="text-xs text-slate-400">Keine Tickets</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
