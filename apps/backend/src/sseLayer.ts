import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { SSEStreamingApi } from 'hono/streaming'
import { refinementEvents, type QuestionEvent, type StatusEvent, type ProgressEvent } from './events'

const connections = new Map<string, SSEStreamingApi>()

/** Sends a JSON-encoded SSE data frame to the connected client for a ticket. No-op if no client is connected. */
async function send(ticketId: string, payload: object): Promise<void> {
  const stream = connections.get(ticketId)
  if (stream) {
    try {
      await stream.writeSSE({ data: JSON.stringify(payload) })
    } catch (err) {
      console.warn('[SSE] client disconnected mid-send for ticket', ticketId, err)
    }
  }
}

// SSE comment frame — flushes proxy buffers on connection. Uses stream.write (not writeSSE)
// to avoid a 'data:' prefix; the leading ':' makes it a no-op for the browser.
async function ssePing(stream: SSEStreamingApi): Promise<void> {
  await stream.write(': ok\n\n')
}

/** Resolves when the client closes the SSE connection. */
function waitForDisconnect(stream: SSEStreamingApi): Promise<void> {
  return new Promise((resolve) => stream.onAbort(resolve))
}

/**
 * Manages the lifecycle of a single SSE connection for a ticket.
 *
 * 1. Sends an initial ping to flush proxy buffers.
 * 2. Registers the stream so `send` can push events to it.
 * 3. Waits until the client disconnects, then removes the stream.
 */
async function handleStream(ticketId: string, stream: SSEStreamingApi): Promise<void> {
  await ssePing(stream)
  connections.set(ticketId, stream)
  await waitForDisconnect(stream)
  if (connections.get(ticketId) === stream) {
    connections.delete(ticketId)
  }
}

/**
 * Registers the SSE endpoint and wires it to the internal refinement event bus.
 *
 * Endpoint: GET /events?ticketId=<id>
 *
 * Flow:
 * 1. Client connects → stream is stored in `connections` keyed by ticketId.
 * 2. refinementEvents emits 'question', 'status', or 'progress' → `send` looks up
 *    the stream and writes a JSON-encoded SSE data frame.
 * 3. Client disconnects (onAbort) → stream is removed from `connections`.
 *
 * Only one active stream per ticketId is supported. A new connection for the same
 * ticketId silently replaces the previous one.
 */
export function initSSE(app: Hono): void {
  app.get('/events', (c) => {
    const ticketId = c.req.query('ticketId')
    if (!ticketId) {
      return c.json({ error: 'ticketId query parameter is required' }, 400)
    }

    return streamSSE(c, (stream) => handleStream(ticketId, stream))
  })

  refinementEvents.on('question', ({ ticketId, question }: QuestionEvent) => {
    void send(ticketId, { type: 'question', question })
  })

  refinementEvents.on('status', ({ ticketId, status }: StatusEvent) => {
    void send(ticketId, { type: 'status', status })
  })

  refinementEvents.on('progress', ({ ticketId, message }: ProgressEvent) => {
    void send(ticketId, { type: 'progress', message })
  })
}
