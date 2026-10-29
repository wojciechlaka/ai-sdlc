import type { Stage, TicketDto } from '@refinement/shared'
import { STAGE_LABEL } from '@/lib/constants'
import { formatCost } from '@/lib/format'
import { TicketCard } from './TicketCard'

const COLUMNS: readonly Stage[] = ['plan', 'design', 'done']

/** Tickets grouped by playbook stage, with the agent cost of all tickets above the columns. */
export function Board({ tickets }: { tickets: TicketDto[] }) {
  const totalCostUsd = tickets.reduce((sum, ticket) => sum + ticket.totalCostUsd, 0)
  return (
    <div className="space-y-3 p-6">
      <p className="text-xs text-slate-500">
        Agent-Kosten gesamt: <span className="font-semibold text-slate-700">{formatCost(totalCostUsd)}</span>
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
    </div>
  )
}
