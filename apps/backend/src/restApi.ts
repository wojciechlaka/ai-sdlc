import { Hono } from 'hono'
import type { Context } from 'hono'
import { errorCode, type UseCases } from '@refinement/core'

const STATUS_BY_CODE = { NOT_FOUND: 404, CONFLICT: 409, VALIDATION: 400 } as const

/** Maps domain errors to HTTP status codes; everything else is a logged 500. */
function handleError(c: Context, err: unknown, route: string) {
  const code = errorCode(err)
  if (code) return c.json({ error: (err as Error).message }, STATUS_BY_CODE[code])
  console.error(`[${route}]`, err)
  return c.json({ error: 'Internal server error' }, 500)
}

/** Invalid JSON becomes `{}` so the use case reports a ValidationError (400). */
async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return {}
  }
}

/** Hono driving adapter: thin mapping of REST routes onto the use cases. */
export function createApp(engine: UseCases) {
  const app = new Hono()

  app.get('/tickets', (c) => c.json(engine.listTickets()))

  app.get('/tickets/:id', (c) => {
    try {
      return c.json(engine.getTicket(c.req.param('id')))
    } catch (err) {
      return handleError(c, err, 'GET /tickets/:id')
    }
  })

  app.post('/tickets', async (c) => {
    try {
      return c.json(engine.createTicket(await readJson(c)), 201)
    } catch (err) {
      return handleError(c, err, 'POST /tickets')
    }
  })

  app.post('/tickets/:id/refine', async (c) => {
    try {
      engine.startRefinement(c.req.param('id'), await readJson(c))
      return c.json({ message: 'Refinement started' }, 202)
    } catch (err) {
      return handleError(c, err, 'POST /tickets/:id/refine')
    }
  })

  app.post('/tickets/:id/answer', async (c) => {
    try {
      engine.answerQuestion(c.req.param('id'), await readJson(c))
      return c.json({ ok: true }, 202)
    } catch (err) {
      return handleError(c, err, 'POST /tickets/:id/answer')
    }
  })

  app.post('/tickets/:id/stop', async (c) => {
    try {
      await engine.stopRefinement(c.req.param('id'))
      return c.json({ message: 'Refinement stopped' }, 202)
    } catch (err) {
      return handleError(c, err, 'POST /tickets/:id/stop')
    }
  })

  app.delete('/tickets/:id', (c) => {
    try {
      engine.deleteTicket(c.req.param('id'))
      return new Response(null, { status: 204 })
    } catch (err) {
      return handleError(c, err, 'DELETE /tickets/:id')
    }
  })

  app.get('/runs/:id', (c) => {
    try {
      return c.json(engine.getRun(c.req.param('id')))
    } catch (err) {
      return handleError(c, err, 'GET /runs/:id')
    }
  })

  app.post('/system/reset', async (c) => {
    try {
      return c.json(await engine.resetSystem())
    } catch (err) {
      return handleError(c, err, 'POST /system/reset')
    }
  })

  return app
}
