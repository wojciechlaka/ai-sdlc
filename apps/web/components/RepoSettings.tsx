'use client'

import { useState } from 'react'
import { Label } from './ui/label'
import { useAppState } from './AppStateProvider'

/** Repository URL used for new refinements; edited inline, stored in localStorage. */
export function RepoSettings() {
  const { repoUrl, setRepoUrl } = useAppState()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const confirm = () => {
    const url = draft.trim()
    if (!url) return
    setRepoUrl(url)
    setEditing(false)
  }

  const startEdit = () => {
    setDraft(repoUrl ?? '')
    setEditing(true)
  }

  return (
    <div className="p-3 border-b border-slate-200 space-y-2">
      <Label className="text-xs text-slate-500">Repository</Label>
      {repoUrl === null ? null : editing || repoUrl === '' ? (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder="Repository URL"
            autoComplete="off"
            name="refinement-engine-repo-xk92"
            autoFocus={repoUrl !== ''}
            className="input-sm"
          />
          <button onClick={confirm} disabled={!draft.trim()} className="btn-ghost-xs disabled:opacity-40">
            Setzen
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="break-all text-xs font-mono text-muted-foreground">{repoUrl}</p>
          <button onClick={startEdit} className="btn-ghost-xs">
            Ändern
          </button>
        </div>
      )}
    </div>
  )
}
