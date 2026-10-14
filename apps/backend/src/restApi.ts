import { Hono } from 'hono'
import {
  listTickets, getTicket, createTicket, deleteTicket,
  updateTicketStatus, resetToSeeds, formatTicketId, parseTicketId,
} from './db/tickets'
import type { TicketRow } from './db/tickets'
import { getAgentRun, getLatestRun } from './db/agentRuns'
import { appendAuditEvent } from './db/auditEvents'
import { startRefinement, startAnswerRun, stopRefinement } from './refinementOrchestrator'
import { refinementEvents } from './events'

interface CreateTicketBody {
  title?: string
  description?: string
}

interface RefineBody {
  repo?: string
  model?: string
  acceptanceCriteria?: string
}

interface SubmitAnswerBody {
  answer?: string
}

const STOP_SETTLE_MS = 500

function toApiTicket(row: TicketRow) {
  return { ...row, id: formatTicketId(row.id) }
}

/** Builds and returns the Hono application with all REST routes mounted. */
export function createApp() {
  const app = new Hono()

  app.get('/tickets', (c) => {
    return c.json(listTickets().map(toApiTicket))
  })

  app.get('/tickets/:id', (c) => {
    try {
      const numId = parseTicketId(c.req.param('id'))
      const ticket = getTicket(numId)
      const latestRun = getLatestRun(numId)
      return c.json({ ...toApiTicket(ticket), latestRun })
    } catch {
      return c.json({ error: 'Ticket not found' }, 404)
    }
  })

  app.post('/tickets', async (c) => {
    try {
      const { title, description } = await c.req.json<CreateTicketBody>()
      if (!title || !description) {
        return c.json({ error: 'title and description are required' }, 400)
      }
      const ticket = createTicket({ title, description })
      appendAuditEvent({ ticketId: ticket.id, actor: 'human', type: 'ticket_created', payload: null })
      return c.json(toApiTicket(ticket), 201)
    } catch (err) {
      console.error('[POST /tickets]', err)
      return c.json({ error: 'Failed to create ticket' }, 500)
    }
  })

  app.post('/tickets/:id/refine', async (c) => {
    let numId: number
    let ticket: TicketRow
    try {
      numId = parseTicketId(c.req.param('id'))
      ticket = getTicket(numId)
    } catch {
      return c.json({ error: 'Ticket not found' }, 404)
    }
    if (ticket.status !== 'backlog' && ticket.status !== 'review') {
      return c.json({ error: 'Ticket is not in a refineable state' }, 409)
    }
    try {
      const { repo, model, acceptanceCriteria = '' } = await c.req.json<RefineBody>()
      if (!repo || !model) return c.json({ error: 'repo and model are required' }, 400)
      updateTicketStatus(numId, 'refining')
      refinementEvents.emit('status', { ticketId: formatTicketId(numId), status: 'refining' })
      startRefinement(numId, { repo, model, acceptanceCriteria }).catch((err) => {
        console.error('[startRefinement background]', err)
      })
      return c.json({ message: 'Refinement started' }, 202)
    } catch (err) {
      console.error('[POST /tickets/:id/refine]', err)
      return c.json({ error: 'Invalid request body' }, 400)
    }
  })

  app.post('/tickets/:id/stop', async (c) => {
    try {
      const numId = parseTicketId(c.req.param('id'))
      stopRefinement(formatTicketId(numId))
      await new Promise(resolve => setTimeout(resolve, STOP_SETTLE_MS))
      const ticket = getTicket(numId)
      if (ticket.status === 'refining') {
        updateTicketStatus(numId, 'backlog')
        refinementEvents.emit('status', { ticketId: formatTicketId(numId), status: 'backlog' })
      }
      return c.json({ message: 'Refinement stopped' }, 202)
    } catch {
      return c.json({ message: 'Refinement stopped' }, 202)
    }
  })

  app.delete('/tickets/:id', (c) => {
    let numId: number
    let ticket: TicketRow
    try {
      numId = parseTicketId(c.req.param('id'))
      ticket = getTicket(numId)
    } catch {
      return c.json({ error: 'Ticket not found' }, 404)
    }
    if (ticket.status === 'refining') {
      return c.json({ error: 'Cannot delete a ticket while refinement is running' }, 409)
    }
    deleteTicket(numId)
    return new Response(null, { status: 204 })
  })

  app.get('/runs/:id', (c) => {
    try {
      return c.json(getAgentRun(c.req.param('id')))
    } catch {
      return c.json({ error: 'Run not found' }, 404)
    }
  })

  app.post('/system/reset', async (c) => {
    try {
      const current = listTickets()
      for (const t of current) {
        if (t.status === 'refining') stopRefinement(formatTicketId(t.id))
      }
      await new Promise(resolve => setTimeout(resolve, STOP_SETTLE_MS))
      const fresh = resetToSeeds()
      return c.json(fresh.map(toApiTicket))
    } catch (err) {
      console.error('[POST /system/reset]', err)
      return c.json({ error: 'Reset failed' }, 500)
    }
  })

  app.post('/tickets/:id/answer', async (c) => {
    let numId: number
    let ticket: TicketRow
    try {
      numId = parseTicketId(c.req.param('id'))
      ticket = getTicket(numId)
    } catch {
      return c.json({ error: 'Ticket not found' }, 404)
    }
    if (ticket.status !== 'refining') {
      return c.json({ error: 'Ticket is not awaiting an answer' }, 409)
    }
    const latestRun = getLatestRun(numId)
    if (latestRun?.trigger === 'answer' && latestRun.status === 'running') {
      return c.json({ error: 'Answer already in progress' }, 409)
    }
    try {
      const { answer } = await c.req.json<SubmitAnswerBody>()
      if (!answer?.trim()) return c.json({ error: 'answer is required' }, 400)
      startAnswerRun(numId, answer).catch((err) => {
        console.error('[startAnswerRun background]', err)
      })
      return c.json({ ok: true }, 202)
    } catch (err) {
      console.error('[POST /tickets/:id/answer]', err)
      return c.json({ error: 'Invalid request body' }, 400)
    }
  })

  return app
}
