'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { TicketDto } from '@refinement/shared'
import { STATUS_LABEL, STATUS_VARIANT } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'

/** Sidebar list; a client component only because it highlights the ticket of the current URL. */
export function TicketList({ tickets }: { tickets: TicketDto[] }) {
  const pathname = usePathname()

  return (
    <ul className="list-none p-0 m-0">
      {tickets.map((ticket) => {
        const active = pathname === `/tickets/${ticket.id}`
        return (
          <li key={ticket.id}>
            <Link
              href={`/tickets/${ticket.id}`}
              className={`block w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-l-2 ${
                active ? 'border-slate-900 bg-slate-50' : 'border-transparent'
              }`}
            >
              <div className="font-medium text-sm truncate">{ticket.title}</div>
              <Badge variant={STATUS_VARIANT[ticket.status]} className="mt-1 text-xs">
                {STATUS_LABEL[ticket.status]}
              </Badge>
            </Link>
            <Separator />
          </li>
        )
      })}
    </ul>
  )
}
