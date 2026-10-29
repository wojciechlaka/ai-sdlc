'use client'

import { useRouter } from 'next/navigation'
import { useSSE } from '@/hooks/useSSE'

/**
 * Keeps the server-rendered board current: a state change of any ticket refreshes it.
 * A client component: it holds the SSE connection and calls `router.refresh()`; it renders nothing.
 */
export function BoardLive() {
  const router = useRouter()
  useSSE(null, {
    onMessage: (event) => {
      if (event.type === 'state') {
        router.refresh()
      }
    },
    onReconnect: () => router.refresh(),
  })
  return null
}
