import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import http from 'http'
import { createNodeEventPublisher, type UseCases } from '@refinement/core'
import { initSSE } from '../src/sseLayer'

function setup() {
  const events = createNodeEventPublisher()
  const engine = { subscribeToTicket: events.subscribe } as unknown as UseCases
  const app = new Hono()
  initSSE(app, engine)
  return { app, events }
}

function startServer(app: Hono): Promise<{ server: ReturnType<typeof serve>; port: number }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => resolve({ server, port: info.port }))
  })
}

function openSSE(port: number, ticketId: string): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/events?ticketId=${ticketId}`, (res) => resolve({ req, res }))
    req.on('error', reject)
  })
}

const close = (server: ReturnType<typeof serve>) => new Promise<void>((r) => server.close(() => r()))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('initSSE', () => {
  it('responds with SSE headers', async () => {
    const { app } = setup()
    const { server, port } = await startServer(app)
    const { req, res } = await openSSE(port, 'T-1')
    req.destroy()
    await close(server)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
  })

  it('forwards events of the ticket, including the ticketId', async () => {
    const { app, events } = setup()
    const { server, port } = await startServer(app)
    let received = ''
    const { req, res } = await openSSE(port, 'T-2')
    res.on('data', (chunk: Buffer) => { received += chunk.toString() })

    await wait(50)
    events.publish({ type: 'progress', ticketId: 'T-2', message: 'hello' })
    events.publish({ type: 'progress', ticketId: 'T-3', message: 'other ticket' })
    await wait(50)

    req.destroy()
    await close(server)
    expect(received).toContain('"type":"progress","ticketId":"T-2","message":"hello"')
    expect(received).not.toContain('other ticket')
  })

  it('returns 400 when ticketId is missing', async () => {
    const { app } = setup()
    const { server, port } = await startServer(app)
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`http://localhost:${port}/events`, (res) => { res.resume(); resolve(res.statusCode!) }).on('error', reject)
    })
    await close(server)
    expect(status).toBe(400)
  })

  it('unsubscribes after the client disconnects', async () => {
    const events = createNodeEventPublisher()
    let unsubscribed = 0
    const engine = {
      subscribeToTicket: (ticketId: string, listener: Parameters<typeof events.subscribe>[1]) => {
        const unsubscribe = events.subscribe(ticketId, listener)
        return () => { unsubscribed += 1; unsubscribe() }
      },
    } as unknown as UseCases
    const app = new Hono()
    initSSE(app, engine)
    const { server, port } = await startServer(app)
    const { req } = await openSSE(port, 'T-4')
    await wait(50)
    expect(unsubscribed).toBe(0)
    req.destroy()
    await wait(50)
    expect(unsubscribed).toBe(1)
    expect(() => events.publish({ type: 'progress', ticketId: 'T-4', message: 'after' })).not.toThrow()
    await close(server)
  })
})
