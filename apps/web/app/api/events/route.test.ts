// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

/** Listener of the fake event bus; route.ts only needs the ticket key of an event. */
type Handler = (event: { ticketKey: string }) => void

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<Handler>>()
  const ALL = '*'
  return {
    subscribe(ticketKey: string | null, handler: Handler) {
      const name = ticketKey ?? ALL
      if (!handlers.has(name)) handlers.set(name, new Set())
      handlers.get(name)!.add(handler)
      return () => { handlers.get(name)!.delete(handler) }
    },
    publish(event: { ticketKey: string }) {
      handlers.get(event.ticketKey)?.forEach((handler) => handler(event))
      handlers.get(ALL)?.forEach((handler) => handler(event))
    },
    count: (ticketKey: string | null) => handlers.get(ticketKey ?? ALL)?.size ?? 0,
  }
})

vi.mock('@/lib/container', () => ({
  getEngine: () => ({ subscribe: (key: string | null, h: Handler) => bus.subscribe(key, h) }),
}))

import { GET } from './route'

const decoder = new TextDecoder()

describe('GET /api/events', () => {
  it('streams a ping, then the events of one ticket', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-1', { signal: controller.signal }))
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')

    bus.publish({ type: 'progress', ticketKey: 'CB-2', message: 'other' } as never)
    bus.publish({ type: 'progress', ticketKey: 'CB-1', message: 'hi' } as never)
    expect(decoder.decode((await reader.read()).value)).toBe('data: {"type":"progress","ticketKey":"CB-1","message":"hi"}\n\n')
    controller.abort()
  })

  it('streams the events of all tickets without ticketKey (board)', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events', { signal: controller.signal }))
    const reader = res.body!.getReader()
    await reader.read()

    bus.publish({ type: 'state', ticketKey: 'CB-7', stage: 'plan', state: 'running' } as never)
    expect(decoder.decode((await reader.read()).value)).toContain('"ticketKey":"CB-7"')
    controller.abort()
  })

  it('unsubscribes and ends the stream when the client disconnects', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-3', { signal: controller.signal }))
    const reader = res.body!.getReader()
    await reader.read()
    expect(bus.count('CB-3')).toBe(1)

    controller.abort()

    expect(bus.count('CB-3')).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })

  it('does not stay subscribed when the request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-5', { signal: controller.signal }))
    expect(bus.count('CB-5')).toBe(0)
    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')
    expect((await reader.read()).done).toBe(true)
  })
})
