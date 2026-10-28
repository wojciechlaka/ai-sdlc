import ReactMarkdown from 'react-markdown'
import type { PrState, StageViewDto } from '@refinement/shared'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const TITLE: Record<StageViewDto['stage'], string> = { plan: '1 Plan · Intent', design: '2 Design · Spec' }
const PR_STATE: Record<PrState, string> = { open: 'offen', merged: 'gemergt', closed: 'geschlossen' }
const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' })

/** The YAML header is metadata for tools; Markdown would render it as text. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '')
}

/** One artifact stage: done mark, links to file and PR, content (live from the default branch) in a collapsible block. */
export function StagePanel({ view }: { view: StageViewDto }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={view.completed ? 'text-emerald-600' : 'text-slate-300'}>
            <span aria-hidden="true">{view.completed ? '✓' : '○'}</span>
            <span className="sr-only">{view.completed ? 'abgeschlossen' : 'offen'}</span>
          </span>
          {TITLE[view.stage]}
          {view.mergedAt && <span className="text-xs font-normal text-slate-400">gemergt am {DATE.format(view.mergedAt)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-3">
          {view.completed ? (
            <a href={view.fileUrl} target="_blank" rel="noreferrer" className="font-mono underline">{view.path}</a>
          ) : (
            <span className="font-mono text-slate-400">{view.path}</span>
          )}
          {view.pr && (
            <a href={view.pr.url} target="_blank" rel="noreferrer" className="underline">
              PR #{view.pr.number} ({PR_STATE[view.pr.state]})
            </a>
          )}
        </div>
        {view.content !== null && (
          <details>
            <summary className="btn-ghost-xs cursor-pointer">Inhalt anzeigen</summary>
            <div className="prose-plan">
              <ReactMarkdown>{stripFrontMatter(view.content)}</ReactMarkdown>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
