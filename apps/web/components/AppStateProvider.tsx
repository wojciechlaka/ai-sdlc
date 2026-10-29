'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const REPO_URL_KEY = 'repoUrl'

export interface AppState {
  /** null until localStorage has been read on the client. */
  repoUrl: string | null
  setRepoUrl(url: string): void
  progressLogs: Record<string, string[]>
  appendProgress(ticketId: string, message: string): void
  clearProgress(): void
}

const AppStateContext = createContext<AppState | null>(null)

/**
 * Client state that must survive navigation between tickets: the target repository
 * (persisted in localStorage) and the live progress log per ticket. Lives in the root layout,
 * which App Router keeps mounted across navigations.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [repoUrl, setRepoUrlState] = useState<string | null>(null)
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setRepoUrlState(localStorage.getItem(REPO_URL_KEY) ?? '')
  }, [])

  const setRepoUrl = useCallback((url: string) => {
    localStorage.setItem(REPO_URL_KEY, url)
    setRepoUrlState(url)
  }, [])

  const appendProgress = useCallback((ticketId: string, message: string) => {
    setProgressLogs((prev) => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), message] }))
  }, [])

  const clearProgress = useCallback(() => setProgressLogs({}), [])

  const value = useMemo(
    () => ({ repoUrl, setRepoUrl, progressLogs, appendProgress, clearProgress }),
    [repoUrl, setRepoUrl, progressLogs, appendProgress, clearProgress],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
