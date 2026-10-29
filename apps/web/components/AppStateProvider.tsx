'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/** Client state shared across pages: the live progress log per ticket. */
export interface AppState {
  /** Progress messages per ticket key, oldest first. */
  progressLogs: Record<string, string[]>
  /** Adds one progress message to the ticket's live log. */
  appendProgress(ticketKey: string, message: string): void
  /** Without a key all live logs are cleared, with a key only that ticket's. */
  clearProgress(ticketKey?: string): void
}

const AppStateContext = createContext<AppState | null>(null)

/**
 * Client state that must survive navigation between tickets: the live progress log per ticket.
 * Lives in the root layout, which App Router keeps mounted across navigations; a client component for React state.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  const appendProgress = useCallback((ticketKey: string, message: string) => {
    setProgressLogs((prev) => ({ ...prev, [ticketKey]: [...(prev[ticketKey] ?? []), message] }))
  }, [])

  const clearProgress = useCallback((ticketKey?: string) => {
    if (ticketKey === undefined) setProgressLogs({})
    else setProgressLogs(({ [ticketKey]: _dropped, ...rest }) => rest)
  }, [])

  const value = useMemo(() => ({ progressLogs, appendProgress, clearProgress }), [progressLogs, appendProgress, clearProgress])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

/** The `AppState` of the surrounding provider. @throws outside `<AppStateProvider>` */
export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
