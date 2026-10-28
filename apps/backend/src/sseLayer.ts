import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { UseCases } from '@refinement/core'

/**
 * Registers `GET /events?ticketId=<id>`: one subscription per connection,
 * removed when the client disconnects. Several tabs per ticket are supported.
 */
export function initSSE(app: Hono, engine: UseCases): void {
  app.get('/events', (c) => {
    const ticketId = c.req.query('ticketId')
    if (!ticketId) return c.json({ error: 'ticketId query parameter is required' }, 400)

    return streamSSE(c, async (stream) => {
      // Comment frame flushes proxy buffers; the leading ':' makes it a no-op for EventSource.
      await stream.write(': ok\n\n')
      const unsubscribe = engine.subscribeToTicket(ticketId, (event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch((err) => {
          console.warn('[SSE] client disconnected mid-send for ticket', ticketId, err)
        })
      })
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      unsubscribe()
    })
  })
}
