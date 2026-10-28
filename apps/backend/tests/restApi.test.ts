import { describe, it, expect, beforeEach } from 'vitest'
import { createUseCases } from '@refinement/core'
import { createTestContext, type TestContext } from '@refinement/core/src/testing/fakes'
import { createApp } from '../src/restApi'

let ctx: TestContext
let app: ReturnType<typeof createApp>

beforeEach(() => {
  ctx = createTestContext()
  app = createApp(createUseCases(ctx.deps))
})

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function createTicket() {
  const res = await app.request('/tickets', json({ title: 'Test', description: 'Desc' }))
  return (await res.json()) as { id: string }
}

describe('GET /tickets', () => {
  it('returns tickets with T-{n} ids', async () => {
    expect(await (await app.request('/tickets')).json()).toEqual([])
    await createTicket()
    const body = (await (await app.request('/tickets')).json()) as Array<{ id: string }>
    expect(body[0].id).toBe('T-1')
  })
})

describe('GET /tickets/:id', () => {
  it('returns the ticket with latestRun or 404', async () => {
    await createTicket()
    const res = await app.request('/tickets/T-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 'T-1', latestRun: null })
    expect((await app.request('/tickets/T-9')).status).toBe(404)
  })
})

describe('POST /tickets', () => {
  it('creates with 201 and rejects invalid bodies with 400', async () => {
    expect((await app.request('/tickets', json({ title: 'T', description: 'D' }))).status).toBe(201)
    expect((await app.request('/tickets', json({ title: 'T' }))).status).toBe(400)
    expect((await app.request('/tickets', { method: 'POST', body: 'not json' })).status).toBe(400)
  })
})

describe('POST /tickets/:id/refine', () => {
  it('starts with 202, then rejects a second start with 409', async () => {
    await createTicket()
    // Keep the agent run pending so the ticket stays 'refining' between the two requests.
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const run = ctx.agent.run.bind(ctx.agent)
    ctx.agent.run = async (input, onProgress) => { await gate; return run(input, onProgress) }
    const body = { repo: 'https://github.com/x/y', model: 'm' }
    expect((await app.request('/tickets/T-1/refine', json(body))).status).toBe(202)
    expect((await app.request('/tickets/T-1/refine', json(body))).status).toBe(409)
    release()
    await ctx.settle()
  })

  it('returns 404 for unknown tickets and 400 without repo', async () => {
    expect((await app.request('/tickets/T-9/refine', json({ repo: 'r', model: 'm' }))).status).toBe(404)
    await createTicket()
    expect((await app.request('/tickets/T-1/refine', json({ model: 'm' }))).status).toBe(400)
  })
})

describe('POST /tickets/:id/answer', () => {
  it('returns 409 when the ticket is not awaiting an answer', async () => {
    await createTicket()
    expect((await app.request('/tickets/T-1/answer', json({ answer: 'x' }))).status).toBe(409)
  })
})

describe('POST /tickets/:id/stop', () => {
  it('returns 202 and puts a refining ticket back to backlog', async () => {
    await createTicket()
    ctx.deps.tickets.updateStatus(1, 'refining')
    expect((await app.request('/tickets/T-1/stop', { method: 'POST' })).status).toBe(202)
    expect(ctx.deps.tickets.findById(1)?.status).toBe('backlog')
  })
})

describe('DELETE /tickets/:id', () => {
  it('returns 204, or 409 while refining', async () => {
    await createTicket()
    await createTicket()
    ctx.deps.tickets.updateStatus(2, 'refining')
    expect((await app.request('/tickets/T-1', { method: 'DELETE' })).status).toBe(204)
    expect((await app.request('/tickets/T-2', { method: 'DELETE' })).status).toBe(409)
  })
})

describe('GET /runs/:id', () => {
  it('returns 404 for unknown runs', async () => {
    expect((await app.request('/runs/nope')).status).toBe(404)
  })
})

describe('POST /system/reset', () => {
  it('returns the three seed tickets', async () => {
    const res = await app.request('/system/reset', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(3)
  })
})
