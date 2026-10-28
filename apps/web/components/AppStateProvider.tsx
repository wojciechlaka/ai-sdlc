'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface AppState {
  progressLogs: Record<string, string[]>
  appendProgress(ticketKey: string, message: string): void
  clearProgress(): void
}

const AppStateContext = createContext<AppState | null>(null)

/**
 * Client state that must survive navigation between tickets: the live progress log per ticket.
 * Lives in the root layout, which App Router keeps mounted across navigations.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  const appendProgress = useCallback((ticketKey: string, message: string) => {
    setProgressLogs((prev) => ({ ...prev, [ticketKey]: [...(prev[ticketKey] ?? []), message] }))
  }, [])

  const clearProgress = useCallback(() => setProgressLogs({}), [])

  const value = useMemo(() => ({ progressLogs, appendProgress, clearProgress }), [progressLogs, appendProgress, clearProgress])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
