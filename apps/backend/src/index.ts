import { serve } from '@hono/node-server'
import { createApp } from './restApi'
import { initSSE } from './sseLayer'
import { recoverStuckRuns, seedIfEmpty } from './db/startup'

async function main() {
  seedIfEmpty()
  recoverStuckRuns()
  const app = createApp()
  initSSE(app)
  serve({ fetch: app.fetch, port: 3000 }, () => {
    console.log('Backend on :3000')
  })
}

main()
