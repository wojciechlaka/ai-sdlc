import ReactMarkdown from 'react-markdown'
import type { TicketDetailDto } from '@refinement/shared'
import { STAGE_LABEL, STATE_VARIANT, stateText } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { LogList } from './LogList'
import { StagePanel } from './StagePanel'
import { TicketActions } from './TicketActions'

/** Server-rendered ticket page: header, the one action, source ticket, stages, log. */
export function TicketDetail({ ticket, tokenConfigured }: { ticket: TicketDetailDto; tokenConfigured: boolean }) {
  return (
    <div className="max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{ticket.key}</span>
          {ticket.priority && <span>· Priorität {ticket.priority}</span>}
        </div>
        <h2 className="text-xl font-semibold">{ticket.title}</h2>
        <div className="flex gap-2">
          <Badge variant="outline">{STAGE_LABEL[ticket.stage]}</Badge>
          {ticket.stage !== 'done' && <Badge variant={STATE_VARIANT[ticket.state]}>{stateText(ticket)}</Badge>}
        </div>
      </header>

      {/* key: navigating to another ticket resets model, error and live log state */}
      <TicketActions key={ticket.key} ticket={ticket} tokenConfigured={tokenConfigured} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-600">Ticket</h3>
        <p className="font-mono text-xs text-slate-400">Quelle: {ticket.sourcePath}</p>
        <div className="prose-plan">
          <ReactMarkdown>{ticket.description}</ReactMarkdown>
        </div>
      </section>

      <Separator />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600">Stufen</h3>
        {ticket.stages.map((view) => (
          <StagePanel key={view.stage} view={view} />
        ))}
      </section>

      <Separator />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-600">Log</h3>
        <LogList log={ticket.log} />
      </section>
    </div>
  )
}
