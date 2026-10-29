import Link from 'next/link'
import type { TicketDto } from '@refinement/shared'
import { STATE_VARIANT, stateText } from '@/lib/constants'
import { formatCost } from '@/lib/format'
import { Badge } from './ui/badge'

/** Board card: key, priority, title, — until the ticket is done — its state, and its agent cost once it has one. */
export function TicketCard({ ticket }: { ticket: TicketDto }) {
  return (
    <Link
      href={`/tickets/${ticket.key}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-400"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-mono">{ticket.key}</span>
        {ticket.priority && <span>{ticket.priority}</span>}
      </div>
      <div className="mt-1 text-sm font-medium">{ticket.title}</div>
      {(ticket.stage !== 'done' || ticket.totalCostUsd > 0) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {ticket.stage !== 'done' ? (
            <Badge variant={STATE_VARIANT[ticket.state]} className="text-xs">
              {stateText(ticket)}
            </Badge>
          ) : <span />}
          {ticket.totalCostUsd > 0 && (
            <span className="text-xs text-slate-400" title="Agent-Kosten über alle Stufen">{formatCost(ticket.totalCostUsd)}</span>
          )}
        </div>
      )}
    </Link>
  )
}
