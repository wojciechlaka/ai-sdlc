'use client'

import { useEffect, useRef, useState } from 'react'
import { TicketEventSchema, type TicketEvent } from '@refinement/shared'
import { eventsUrl } from '@/lib/eventStream'

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
    const es = new EventSource(eventsUrl(ticketKey))

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
      const event = parseTicketEvent(e.data)
      if (event) {
        handlersRef.current.onMessage(event)
      }
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

/** A stream message as TicketEvent; null (with a warning) for anything that does not match the contract. */
function parseTicketEvent(data: string): TicketEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    console.warn('SSE message is not JSON', data)
    return null
  }
  const result = TicketEventSchema.safeParse(raw)
  if (!result.success) {
    console.warn('SSE message does not match TicketEvent', raw)
    return null
  }
  return result.data
}
