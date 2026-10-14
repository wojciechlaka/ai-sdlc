// frontend/src/App.tsx
import { useCallback, useEffect, useState } from 'react'
import { fetchTickets, resetSystem, type Ticket } from './api/ticketApi'
import { TicketList } from './components/TicketList'
import { TicketDetail } from './components/TicketDetail'
import { CreateTicketDialog } from './components/CreateTicketDialog'
import { Separator } from './components/ui/separator'
import { Label } from './components/ui/label'

/**
 * Root application component.
 * Renders a two-column layout: a sidebar with the repository input, ticket
 * creation, and ticket list; and a main area with the selected ticket's detail view.
 * Owns the shared progress log map so logs survive ticket selection changes.
 */
export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [repoInput, setRepoInput] = useState('')
  const [repoUrl, setRepoUrl] = useState(() => localStorage.getItem('repoUrl') ?? '')
  const [editingRepo, setEditingRepo] = useState(() => !localStorage.getItem('repoUrl'))
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  const appendProgress = useCallback((ticketId: string, msg: string) => {
    setProgressLogs((prev) => {
      const existing = prev[ticketId] ?? []
      return { ...prev, [ticketId]: [...existing, msg] }
    })
  }, [])

  const handleReset = async () => {
    const fresh = await resetSystem()
    setTickets(fresh)
    setSelectedId(null)
    setProgressLogs({})
  }

  const confirmRepo = () => {
    const url = repoInput.trim()
    if (!url) return
    setRepoUrl(url)
    localStorage.setItem('repoUrl', url)
    setEditingRepo(false)
  }

  const startEditRepo = () => {
    setRepoInput(repoUrl)
    setEditingRepo(true)
  }

  useEffect(() => {
    fetchTickets().then(setTickets).catch(console.error)
  }, [])

  return (
    <div className="flex h-screen bg-white text-slate-900">
      <aside className="min-w-64 w-auto border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-3 font-semibold text-sm tracking-wide text-slate-500 uppercase">
          Tickets
        </div>
        <Separator />
        <div className="p-3 border-b border-slate-200 space-y-2">
          <Label className="text-xs text-slate-500">Repository</Label>
          {editingRepo ? (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmRepo()}
                placeholder="Repository URL"
                autoComplete="off"
                name="refinement-engine-repo-xk92"
                autoFocus={!!repoUrl}
                className="input-sm"
              />
              <button
                onClick={confirmRepo}
                disabled={!repoInput.trim()}
                className="btn-ghost-xs disabled:opacity-40"
              >
                Setzen
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="break-all text-xs font-mono text-muted-foreground">{repoUrl}</p>
              <button
                onClick={startEditRepo}
                className="btn-ghost-xs"
              >
                Ändern
              </button>
            </div>
          )}
        </div>
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <div className="flex-1">
            <CreateTicketDialog
              onCreated={(ticket) => {
                setTickets((prev) => [...prev, ticket])
                setSelectedId(ticket.id)
              }}
            />
          </div>
          <button onClick={handleReset} className="btn-ghost-xs shrink-0" title="Auf CC-Seed-Tickets zurücksetzen">
            Reset
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <TicketList tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {selectedId
          ? <TicketDetail
              ticketId={selectedId}
              repo={repoUrl}
              progressLog={progressLogs[selectedId] ?? []}
              onProgress={appendProgress}
              onUpdated={(updated) =>
                setTickets((prev) => prev.map((t) => t.id === updated.id ? updated : t))
              }
              onDeleted={(id) => {
                setTickets((prev) => prev.filter((t) => t.id !== id))
                setSelectedId(null)
              }}
            />
          : <p className="p-6 text-slate-400 text-sm">Ticket auswählen oder neu erstellen</p>
        }
      </main>
    </div>
  )
}
