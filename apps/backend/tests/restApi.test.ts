import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from '../src/restApi'
import { startAnswerRun } from '../src/refinementOrchestrator'
import { createTicket, updateTicketStatus, parseTicketId } from '../src/db/tickets'
import { db } from '../src/db/client'
import { tickets, agentRuns } from '../src/db/schema'
import { createAgentRun, completeAgentRun } from '../src/db/agentRuns'
import { getEventsForTicket } from '../src/db/auditEvents'

vi.mock('../src/refinementOrchestrator', () => ({
  startRefinement: vi.fn().mockResolvedValue(undefined),
  startAnswerRun: vi.fn().mockResolvedValue(undefined),
  stopRefinement: vi.fn(),
}))

const app = createApp()

beforeEach(() => {
  db.delete(agentRuns).run()
  db.delete(tickets).run()
})

describe('GET /tickets', () => {
  it('returns empty array when no tickets', async () => {
    const res = await app.request('/tickets')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns tickets with T-{n} ids', async () => {
    createTicket({ title: 'Test', description: 'Desc' })
    const res = await app.request('/tickets')
    const body = await res.json() as Array<{ id: string }>
    expect(body[0].id).toMatch(/^T-\d+$/)
  })
})

describe('GET /tickets/:id', () => {
  it('returns ticket with latestRun', async () => {
    const t = createTicket({ title: 'Test', description: 'Desc' })
    const res = await app.request(`/tickets/T-${t.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; latestRun: null }
    expect(body.id).toBe(`T-${t.id}`)
    expect(body.latestRun).toBeNull()
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.request('/tickets/T-9999')
    expect(res.status).toBe(404)
  })
})

describe('POST /tickets', () => {
  it('creates a ticket with title and description', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', description: 'Desc' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; status: string }
    expect(body.id).toMatch(/^T-\d+$/)
    expect(body.status).toBe('backlog')
    const numId = parseTicketId(body.id)
    const events = getEventsForTicket(numId)
    expect(events.some(e => e.type === 'ticket_created')).toBe(true)
  })

  it('returns 400 when title is missing', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Desc' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /tickets/:id/refine', () => {
  it('returns 202 when ticket is in backlog', async () => {
    const t = createTicket({ title: 'Test', description: 'Desc' })
    const res = await app.request(`/tickets/T-${t.id}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'https://github.com/x/y', model: 'claude-sonnet-4-6' }),
    })
    expect(res.status).toBe(202)
  })

  it('returns 409 when ticket is refining', async () => {
    const t = createTicket({ title: 'Test', description: 'Desc' })
    updateTicketStatus(t.id, 'refining')
    const res = await app.request(`/tickets/T-${t.id}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: 'https://github.com/x/y', model: 'claude-sonnet-4-6' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 400 when repo is missing', async () => {
    const t = createTicket({ title: 'Test', description: 'Desc' })
    const res = await app.request(`/tickets/T-${t.id}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /runs/:id', () => {
  it('returns 404 for unknown run', async () => {
    const res = await app.request('/runs/nonexistent')
    expect(res.status).toBe(404)
  })

  it('returns the run when it exists', async () => {
    const t = createTicket({ title: 'Test', description: '' })
    const run = createAgentRun({
      ticketId: t.id,
      trigger: 'initial',
      input: {
        ticketTitle: t.title,
        ticketDescription: t.description,
        acceptanceCriteria: '',
        repo: 'https://github.com/x/y',
        model: 'claude-sonnet-4-6',
      },
      model: 'claude-sonnet-4-6',
    })
    const res = await app.request(`/runs/${run.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; status: string }
    expect(body.id).toBe(run.id)
    expect(body.status).toBe('running')
  })
})

describe('DELETE /tickets/:id', () => {
  it('deletes a backlog ticket', async () => {
    const t = createTicket({ title: 'Test', description: '' })
    const res = await app.request(`/tickets/T-${t.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
  })

  it('returns 409 when ticket is refining', async () => {
    const t = createTicket({ title: 'Test', description: '' })
    updateTicketStatus(t.id, 'refining')
    const res = await app.request(`/tickets/T-${t.id}`, { method: 'DELETE' })
    expect(res.status).toBe(409)
  })
})

describe('POST /system/reset', () => {
  it('returns 200 with 3 seed tickets', async () => {
    const res = await app.request('/system/reset', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; title: string }>
    expect(body).toHaveLength(3)
    expect(body.every((t) => t.id.startsWith('T-'))).toBe(true)
  })
})

describe('POST /tickets/:id/answer', () => {
  it('starts an answer run for a refining ticket and returns 202', async () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    updateTicketStatus(ticket.id, 'refining')
    // Create a question run so startAnswerRun can find a pending question
    const run = createAgentRun({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'https://github.com/x/y', model: 'm' },
    })
    completeAgentRun(run.id, {
      output: { type: 'question', question: 'Which DB?' },
      costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })

    const res = await app.request(`/tickets/T-${ticket.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'PostgreSQL' }),
    })
    expect(res.status).toBe(202)
    expect(vi.mocked(startAnswerRun)).toHaveBeenCalledWith(ticket.id, 'PostgreSQL')
  })

  it('returns 409 when ticket is not refining', async () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    // status is 'backlog' by default

    const res = await app.request(`/tickets/T-${ticket.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'PostgreSQL' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 400 when answer is missing', async () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    updateTicketStatus(ticket.id, 'refining')
    const res = await app.request(`/tickets/T-${ticket.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('returns 409 when an answer run is already in progress', async () => {
    const ticket = createTicket({ title: 'T', description: 'D' })
    updateTicketStatus(ticket.id, 'refining')
    // answer run still running — not yet completed
    createAgentRun({
      ticketId: ticket.id, trigger: 'answer', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'https://github.com/x/y', model: 'm' },
    })

    const res = await app.request(`/tickets/T-${ticket.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'PostgreSQL' }),
    })
    expect(res.status).toBe(409)
  })
})
