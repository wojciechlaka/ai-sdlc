// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

type Handler = (event: { ticketId: string }) => void

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: { ticketId: string }) => void>>()
  return {
    subscribe(ticketId: string, handler: (event: { ticketId: string }) => void) {
      if (!handlers.has(ticketId)) handlers.set(ticketId, new Set())
      handlers.get(ticketId)!.add(handler)
      return () => { handlers.get(ticketId)!.delete(handler) }
    },
    publish(event: { ticketId: string }) {
      handlers.get(event.ticketId)?.forEach((handler) => handler(event))
    },
    count: (ticketId: string) => handlers.get(ticketId)?.size ?? 0,
  }
})

vi.mock('@/lib/container', () => ({
  getEngine: () => ({ subscribeToTicket: (id: string, h: Handler) => bus.subscribe(id, h) }),
}))

import { GET } from './route'

const decoder = new TextDecoder()

describe('GET /api/events', () => {
  it('returns 400 without ticketId', async () => {
    const res = GET(new Request('http://localhost/api/events'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'ticketId query parameter is required' })
  })

  it('streams a ping, then the events of the ticket', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketId=T-1', { signal: controller.signal }))
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')

    bus.publish({ type: 'progress', ticketId: 'T-2', message: 'other' } as never)
    bus.publish({ type: 'progress', ticketId: 'T-1', message: 'hi' } as never)
    expect(decoder.decode((await reader.read()).value)).toBe(
      'data: {"type":"progress","ticketId":"T-1","message":"hi"}\n\n',
    )
    controller.abort()
  })

  it('unsubscribes and ends the stream when the client disconnects', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketId=T-3', { signal: controller.signal }))
    const reader = res.body!.getReader()
    await reader.read()
    expect(bus.count('T-3')).toBe(1)

    controller.abort()

    expect(bus.count('T-3')).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })

  it('does not stay subscribed when the request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const res = GET(new Request('http://localhost/api/events?ticketId=T-5', { signal: controller.signal }))
    expect(bus.count('T-5')).toBe(0)
    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')
    expect((await reader.read()).done).toBe(true)
  })
})
