import { serve } from '@hono/node-server'
import { engine } from './engine'
import { createApp } from './restApi'
import { initSSE } from './sseLayer'

engine.startup()
const app = createApp(engine)
initSSE(app, engine)
serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('Backend on :3000')
})
