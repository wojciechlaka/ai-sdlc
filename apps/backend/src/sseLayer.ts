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
      // Register the abort handler first so an early disconnect cannot leak the subscription.
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve))
      const unsubscribe = engine.subscribeToTicket(ticketId, (event) => {
        void stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          // Client went away mid-send; the abort handler cleans up.
        })
      })
      try {
        // Comment frame flushes proxy buffers; the leading ':' makes it a no-op for EventSource.
        await stream.write(': ok\n\n')
        if (!stream.aborted) await closed
      } finally {
        unsubscribe()
      }
    })
  })
}
