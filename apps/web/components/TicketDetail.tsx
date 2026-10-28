import type { TicketDetailDto } from '@refinement/shared'
import { STATUS_VARIANT } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { TicketLive } from './TicketLive'
import { PlanSection } from './PlanSection'

/** Server-rendered ticket page; the interactive parts live in TicketLive. */
export function TicketDetail({ ticket }: { ticket: TicketDetailDto }) {
  const output = ticket.latestRun?.output
  const refinementOutput = output?.type === 'refinement' ? output.result : null

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{ticket.title}</h2>
        <Badge variant={STATUS_VARIANT[ticket.status]} className="shrink-0">
          {ticket.status}
        </Badge>
      </div>

      {/* key: navigating to another ticket must reset model, error and answer state */}
      <TicketLive key={ticket.id} ticket={ticket}>
        <Separator />
        <section>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Beschreibung</h3>
          <p className="text-sm text-slate-700">{ticket.description}</p>
        </section>
      </TicketLive>

      {refinementOutput && <PlanSection output={refinementOutput} />}
    </div>
  )
}
