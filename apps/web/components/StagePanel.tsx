'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { PrState, StageViewDto } from '@refinement/shared'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const TITLE: Record<StageViewDto['stage'], string> = { plan: '1 Plan · Intent', design: '2 Design · Spec' }
const PR_STATE: Record<PrState, string> = { open: 'offen', merged: 'gemergt', closed: 'geschlossen' }
const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

/** The YAML header is metadata for tools; Markdown would render it as text. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '')
}

/** One artifact stage: done mark, links to file and PR, content (live from the default branch) on demand. */
export function StagePanel({ view }: { view: StageViewDto }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span aria-label={view.completed ? 'abgeschlossen' : 'offen'} className={view.completed ? 'text-emerald-600' : 'text-slate-300'}>
            {view.completed ? '✓' : '○'}
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
          <>
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="btn-ghost-xs">
              {open ? 'Inhalt einklappen' : 'Inhalt anzeigen'}
            </button>
            {open && (
              <div className="prose-plan">
                <ReactMarkdown>{stripFrontMatter(view.content)}</ReactMarkdown>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
