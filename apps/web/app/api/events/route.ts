import { getEngine } from '@/lib/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

/**
 * Server-Sent Events for one ticket: `GET /api/events?ticketId=T-1`.
 * One subscription per connection; it is removed when the browser disconnects,
 * so several tabs per ticket work independently.
 */
export function GET(request: Request): Response {
  const ticketId = new URL(request.url).searchParams.get('ticketId')
  if (!ticketId) {
    return Response.json({ error: 'ticketId query parameter is required' }, { status: 400 })
  }

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
      unsubscribe = getEngine().subscribeToTicket(ticketId, (event) => {
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
