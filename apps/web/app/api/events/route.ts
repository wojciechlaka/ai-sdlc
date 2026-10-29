import { getEngine } from '@/lib/container'

/** Node runtime: the engine uses SQLite, child processes and the in-process event bus. */
export const runtime = 'nodejs'
/** A stream per request; never cached. */
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

/**
 * Server-Sent Events: `GET /api/events?ticketKey=CB-1` for one ticket, `GET /api/events` for all
 * tickets (board). One subscription per connection; it is removed when the browser disconnects.
 */
export function GET(request: Request): Response {
  const ticketKey = new URL(request.url).searchParams.get('ticketKey')

  let closed = false
  let unsubscribe = () => {}
  const stop = () => {
    if (closed) return
    closed = true
    unsubscribe()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Comment frame flushes proxy buffers; EventSource ignores it.
      controller.enqueue(encoder.encode(': ok\n\n'))
      unsubscribe = getEngine().subscribe(ticketKey, (event) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })
      const onAbort = () => {
        if (closed) return
        stop()
        controller.close()
      }
      // The client may already be gone before the listener exists — the abort event would never fire.
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort)
    },
    cancel: stop,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
