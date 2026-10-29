import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getEngine } from '@/lib/container'
import { AppStateProvider } from '@/components/AppStateProvider'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

// Every page reads live data from the local database — never prerender.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Refinement Engine',
  description: 'AI-gestützte Ticket-Verfeinerung',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const tickets = getEngine().listTickets()

  return (
    <html lang="de">
      <body>
        <AppStateProvider>
          <div className="flex h-screen bg-white text-slate-900">
            <Sidebar tickets={tickets} />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  )
}
