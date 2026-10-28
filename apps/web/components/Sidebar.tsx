import type { TicketDto } from '@refinement/shared'
import { Separator } from './ui/separator'
import { RepoSettings } from './RepoSettings'
import { CreateTicketDialog } from './CreateTicketDialog'
import { ResetButton } from './ResetButton'
import { TicketList } from './TicketList'

export function Sidebar({ tickets }: { tickets: TicketDto[] }) {
  return (
    <aside className="min-w-64 w-auto border-r border-slate-200 flex flex-col shrink-0">
      <div className="px-4 py-3 font-semibold text-sm tracking-wide text-slate-500 uppercase">Tickets</div>
      <Separator />
      <RepoSettings />
      <div className="p-3 border-b border-slate-200 flex items-center gap-2">
        <div className="flex-1">
          <CreateTicketDialog />
        </div>
        <ResetButton />
      </div>
      <div className="overflow-y-auto flex-1">
        <TicketList tickets={tickets} />
      </div>
    </aside>
  )
}
