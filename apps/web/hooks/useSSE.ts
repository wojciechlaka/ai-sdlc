'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefinementEvent } from '@refinement/shared'

export interface SSEHandlers {
  onMessage: (event: RefinementEvent) => void
  /** Called when the browser re-established a lost connection (events may have been missed). */
  onReconnect?: () => void
}

/**
 * Subscribes to `/api/events?ticketId=<id>`. EventSource reconnects automatically.
 *
 * `intentionallyClosed` prevents `onerror` from reporting a lost connection when the effect
 * cleans up — `EventSource.close()` triggers `onerror` in some browsers.
 *
 * @returns `connected` while the stream is open; `everConnected` latches on first success to
 *          distinguish "not yet connected" from "connection lost".
 */
export function useSSE(ticketId: string, handlers: SSEHandlers) {
  const [connected, setConnected] = useState(false)
  const [everConnected, setEverConnected] = useState(false)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    let intentionallyClosed = false
    let openedBefore = false
    const es = new EventSource(`/api/events?ticketId=${encodeURIComponent(ticketId)}`)

    const markConnected = () => {
      setConnected(true)
      setEverConnected(true)
    }

    es.onopen = () => {
      markConnected()
      if (openedBefore) handlersRef.current.onReconnect?.()
      openedBefore = true
    }

    es.onmessage = (e) => {
      // Some proxies suppress onopen — make sure the flags are set before any message.
      markConnected()
      handlersRef.current.onMessage(JSON.parse(e.data) as RefinementEvent)
    }

    es.onerror = () => {
      if (intentionallyClosed) return
      setConnected(false)
      console.warn('SSE error for ticket', ticketId)
    }

    return () => {
      intentionallyClosed = true
      es.close()
      setConnected(false)
    }
  }, [ticketId])

  return { connected, everConnected }
}
