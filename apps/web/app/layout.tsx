import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getEngine } from '@/lib/container'
import { AppStateProvider } from '@/components/AppStateProvider'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

/** Every page reads live data from the local database — never prerender. */
export const dynamic = 'force-dynamic'

/** Browser title and description (German, user-facing). */
export const metadata: Metadata = {
  title: 'Refinement Engine',
  description: 'Tickets durch die Playbook-Stufen Plan und Design führen',
}

/** App shell: sidebar with settings and reset, the page, and the client state that survives navigation. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AppStateProvider>
          <div className="flex h-screen bg-white text-slate-900">
            <Sidebar settings={getEngine().getSettings()} />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  )
}
