import Link from 'next/link'
import type { SettingsDto } from '@refinement/shared'
import { Separator } from './ui/separator'
import { ResetButton } from './ResetButton'

/** Navigation, target repository (from `TARGET_REPO`, read-only) with the branch the app works on, and reset. */
export function Sidebar({ settings }: { settings: SettingsDto }) {
  const repoSlug = settings.repoUrl.replace('https://github.com/', '')
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200">
      <Link href="/" className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900">
        Board
      </Link>
      <Separator />
      <div className="space-y-1 border-b border-slate-200 p-3">
        <p className="text-xs text-slate-500">Ziel-Repository</p>
        <a href={settings.repoUrl} target="_blank" rel="noreferrer" className="block break-all font-mono text-xs text-slate-700 hover:underline">
          {repoSlug}
        </a>
        <p className="font-mono text-xs text-slate-500">Branch: {settings.baseBranch}</p>
        {!settings.tokenConfigured && (
          <p role="status" className="text-xs text-amber-700">
            Token fehlt — GITHUB_TOKEN in apps/web/.env.local setzen (siehe README).
          </p>
        )}
      </div>
      <div className="p-3">
        <ResetButton />
      </div>
    </aside>
  )
}
