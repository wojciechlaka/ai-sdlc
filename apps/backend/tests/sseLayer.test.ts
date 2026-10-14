import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import http from 'http'

let initSSE: (app: Hono) => void
let refinementEvents: import('events').EventEmitter

beforeEach(async () => {
  vi.resetModules()
  ;({ initSSE } = await import('../src/sseLayer'))
  ;({ refinementEvents } = await import('../src/events'))
})

function startServer(app: Hono): Promise<{ server: ReturnType<typeof serve>; port: number }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({ server, port: info.port })
    })
  })
}

function openSSE(port: number, ticketId: string): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/events?ticketId=${ticketId}`, (res) => {
      resolve({ req, res })
    })
    req.on('error', reject)
  })
}

describe('initSSE', () => {
  it('responds with SSE headers on GET /events', async () => {
    const app = new Hono()
    initSSE(app)
    const { server, port } = await startServer(app)

    const { req, res } = await openSSE(port, 't1')
    req.destroy()
    await new Promise<void>((r) => server.close(() => r()))

    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('forwards a progress event to the connected client', async () => {
    const app = new Hono()
    initSSE(app)
    const { server, port } = await startServer(app)

    let received = ''
    const { req, res } = await openSSE(port, 't2')
    res.on('data', (chunk: Buffer) => { received += chunk.toString() })

    await new Promise((r) => setTimeout(r, 50))
    refinementEvents.emit('progress', { ticketId: 't2', message: 'hello' })
    await new Promise((r) => setTimeout(r, 50))

    req.destroy()
    await new Promise<void>((r) => server.close(() => r()))

    expect(received).toContain('"type":"progress"')
    expect(received).toContain('"message":"hello"')
  })

  it('returns 400 when ticketId is missing', async () => {
    const app = new Hono()
    initSSE(app)
    const { server, port } = await startServer(app)

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.get(`http://localhost:${port}/events`, (res) => {
        res.resume()
        resolve(res.statusCode!)
      })
      req.on('error', reject)
    })
    await new Promise<void>((r) => server.close(() => r()))
    expect(statusCode).toBe(400)
  })

  it('removes connection from map after client disconnects', async () => {
    const app = new Hono()
    initSSE(app)
    const { server, port } = await startServer(app)

    const { req } = await openSSE(port, 't3')
    await new Promise((r) => setTimeout(r, 50))

    req.destroy()
    await new Promise((r) => setTimeout(r, 50))

    expect(() =>
      refinementEvents.emit('progress', { ticketId: 't3', message: 'after-disconnect' })
    ).not.toThrow()

    await new Promise<void>((r) => server.close(() => r()))
  })
})
