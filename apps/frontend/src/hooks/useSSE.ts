import { useEffect, useState } from 'react'

export type SseMessage =
  | { type: 'question'; question: string }
  | { type: 'status'; status: string }
  | { type: 'progress'; message: string }

/**
 * Subscribes to the backend SSE stream for a single ticket.
 *
 * Connects to `GET /events?ticketId=<id>` and parses incoming JSON frames into
 * typed `SseMessage` objects. Reconnection is handled automatically by the
 * browser's `EventSource` API.
 *
 * The `intentionallyClosed` flag prevents the `onerror` handler from marking
 * the connection as lost when the effect cleans up (e.g. on ticketId change or
 * unmount) — `EventSource.close()` triggers `onerror` in some browsers.
 *
 * @param ticketId - Ticket to subscribe to. Pass `null` to skip connecting.
 * @returns
 *   - `lastMessage` — most recent parsed SSE frame, or `null` before the first message.
 *   - `connected` — true while the `EventSource` is open.
 *   - `everConnected` — latches to true on first successful connection; used to
 *     distinguish "not yet connected" from "connection lost".
 */
export function useSSE(ticketId: string | null) {
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null)
  const [connected, setConnected] = useState(false)
  const [everConnected, setEverConnected] = useState(false)

  useEffect(() => {
    if (!ticketId) return

    let intentionallyClosed = false

    const es = new EventSource(`/events?ticketId=${ticketId}`)

    es.onopen = () => {
      setConnected(true)
      setEverConnected(true)
    }

    es.onmessage = (e) => {
      // some proxies suppress onopen — ensure flags are set before any message
      setConnected(true)
      setEverConnected(true)
      setLastMessage(JSON.parse(e.data) as SseMessage)
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

  return { lastMessage, connected, everConnected }
}
