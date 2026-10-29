'use client'

import { useEffect, useRef, useState } from 'react'
import type { TicketEvent } from '@refinement/shared'

/** Callbacks of `useSSE`. */
export interface SSEHandlers {
  /** Called for every ticket event of the stream. */
  onMessage: (event: TicketEvent) => void
  /** Called when the browser re-established a lost connection (events may have been missed). */
  onReconnect?: () => void
}

/**
 * Subscribes to `/api/events?ticketKey=<key>`, or to all tickets with `null` (board).
 * EventSource reconnects automatically.
 *
 * `intentionallyClosed` prevents `onerror` from reporting a lost connection when the effect
 * cleans up — `EventSource.close()` triggers `onerror` in some browsers.
 *
 * @returns `connected` while the stream is open; `everConnected` latches on first success to
 *          distinguish "not yet connected" from "connection lost".
 */
export function useSSE(ticketKey: string | null, handlers: SSEHandlers) {
  const [connected, setConnected] = useState(false)
  const [everConnected, setEverConnected] = useState(false)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    let intentionallyClosed = false
    let openedBefore = false
    const url = ticketKey ? `/api/events?ticketKey=${encodeURIComponent(ticketKey)}` : '/api/events'
    const es = new EventSource(url)

    const markConnected = () => {
      setConnected(true)
      setEverConnected(true)
    }

    es.onopen = () => {
      markConnected()
      if (openedBefore) {
        handlersRef.current.onReconnect?.()
      }
      openedBefore = true
    }

    es.onmessage = (e) => {
      // Some proxies suppress onopen — make sure the flags are set before any message.
      markConnected()
      handlersRef.current.onMessage(JSON.parse(e.data) as TicketEvent)
    }

    es.onerror = () => {
      if (intentionallyClosed) {
        return
      }
      setConnected(false)
      console.warn('SSE error', ticketKey ?? 'all tickets')
    }

    return () => {
      intentionallyClosed = true
      es.close()
      setConnected(false)
    }
  }, [ticketKey])

  return { connected, everConnected }
}
