// frontend/src/components/TicketList.tsx
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { type Ticket, STATUS_VARIANT, STATUS_LABEL } from '../api/ticketApi'

interface Props {
  tickets: Ticket[]
  /** ID of the currently open ticket, used to highlight the active row. */
  selectedId: string | null
  /** Called when the user clicks a ticket row. */
  onSelect: (id: string) => void
}

/**
 * Scrollable list of tickets shown in the sidebar.
 * Each row displays the ticket title and a status badge.
 * The active ticket is highlighted with a left border and background tint.
 */
export function TicketList({ tickets, selectedId, onSelect }: Props) {
  return (
    <ul className="list-none p-0 m-0">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            onClick={() => onSelect(ticket.id)}
            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-l-2 ${
              ticket.id === selectedId ? 'border-slate-900 bg-slate-50' : 'border-transparent'
            }`}
          >
            <div className="font-medium text-sm truncate">{ticket.title}</div>
            <Badge variant={STATUS_VARIANT[ticket.status]} className="mt-1 text-xs">
              {STATUS_LABEL[ticket.status]}
            </Badge>
          </button>
          <Separator />
        </li>
      ))}
    </ul>
  )
}
