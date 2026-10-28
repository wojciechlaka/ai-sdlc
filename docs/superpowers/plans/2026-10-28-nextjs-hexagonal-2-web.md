# Next.js + Hexagonal – Teil 2: Next.js-App – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue Next.js-App `apps/web` liefert dieselbe Funktion wie Vite-Frontend + Hono-Backend in **einem** Prozess: Server Components lesen über die Use Cases, Server Actions schreiben, ein Route Handler streamt SSE.

**Architecture:** `apps/web` ist der treibende Adapter des Hexagons. `lib/container.ts` erzeugt pro Prozess genau eine Engine (`createRefinementEngine` aus `@refinement/core`) und hält sie auf `globalThis`. Client-Komponenten importieren nie Laufzeitcode aus `@refinement/core`, nur Typen. Spec: `docs/superpowers/specs/2026-10-28-nextjs-hexagonal-design.md` (Abschnitt 5).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4 (`@tailwindcss/postcss`), shadcn/Base UI, Vitest 4 + jsdom + Testing Library.

**Voraussetzung:** Teil 1 (`2026-10-28-nextjs-hexagonal-1-core.md`) ist abgeschlossen; `npm test` ist grün. Branch `feature/nextjs-hexagonal`. Befehle laufen im Repo-Root.

Während Teil 2 laufen alte und neue App nebeneinander: Hono :3000, Vite :5173, **Next :3001**. Die neue App hat ihre eigene Datenbank `apps/web/data/refinement.db`.

---

## Dateistruktur von `apps/web`

```
apps/web/
├─ package.json, next.config.ts, tsconfig.json, postcss.config.mjs
├─ vitest.config.ts, vitest.setup.ts, .gitignore
├─ instrumentation.ts           Engine beim Serverstart erzeugen (Migrationen, Seed, Recovery)
├─ app/
│  ├─ globals.css               aus apps/frontend/src/index.css
│  ├─ icon.svg                  aus apps/frontend/public/favicon.svg
│  ├─ layout.tsx                Server: Sidebar + <AppStateProvider>
│  ├─ page.tsx                  „Ticket auswählen oder neu erstellen“
│  ├─ not-found.tsx, error.tsx
│  ├─ tickets/[id]/page.tsx     Server: getTicket → <TicketDetail>
│  ├─ actions.ts                Server Actions (+ actions.test.ts)
│  └─ api/events/route.ts       SSE (+ route.test.ts)
├─ components/
│  ├─ ui/                       shadcn (kopiert; Base-UI-Komponenten mit "use client")
│  ├─ AppStateProvider.tsx      Client: Repo-URL (localStorage) + Fortschritts-Logs
│  ├─ Sidebar.tsx               Server
│  ├─ RepoSettings.tsx, ResetButton.tsx, TicketList.tsx            Client
│  ├─ CreateTicketDialog.tsx    Client (+ test)
│  ├─ TicketDetail.tsx          Server: Kopf, Beschreibung, bettet TicketLive + PlanSection ein
│  ├─ TicketLive.tsx            Client: SSE, Timer, Buttons, Rückfrage (+ test)
│  ├─ TicketMetaRow.tsx, ModelSelect.tsx, AgentRunningCard.tsx, PlanSection.tsx   Client
│  └─ QuestionPanel.tsx         Client (+ test)
├─ hooks/
│  ├─ useSSE.ts                 (+ test)
│  └─ useElapsedSeconds.ts
└─ lib/
   ├─ container.ts              Composition Root (Engine-Singleton)
   ├─ actionResult.ts           ActionResult + runAction (+ test)
   ├─ constants.ts              Modelle, Preise, Status-Labels
   └─ utils.ts                  cn, formatElapsed
```

---

### Task 1: Gerüst `apps/web`

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/postcss.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `apps/web/.gitignore`
- Create: `apps/web/app/layout.tsx` (vorläufig), `apps/web/app/page.tsx`
- Copy: `apps/frontend/src/index.css` → `apps/web/app/globals.css`, `apps/frontend/public/favicon.svg` → `apps/web/app/icon.svg`, `apps/frontend/src/components/ui/*` → `apps/web/components/ui/`, `apps/frontend/src/lib/utils.ts` → `apps/web/lib/utils.ts`
- Create: `apps/web/lib/constants.ts`
- Modify: `package.json` (Root), `.gitignore` (Root)

- [ ] **Step 1: Paket- und Build-Konfiguration anlegen**

`apps/web/package.json`:

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@base-ui/react": "^1.5.0",
    "@fontsource-variable/geist": "^5.2.9",
    "@refinement/core": "*",
    "@refinement/shared": "*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.18.0",
    "next": "^16.4.3",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-markdown": "^10.1.0",
    "shadcn": "^4.11.0",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4.3.0",
    "typescript": "~6.0.2",
    "vite": "^8.0.12",
    "vitest": "^4.1.8"
  }
}
```

`shadcn` bleibt Laufzeit-Abhängigkeit, weil `globals.css` `shadcn/tailwind.css` importiert.

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@refinement/core', '@refinement/shared'],
  // Native module: must be required at runtime, not bundled.
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
```

`apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

`apps/web/vitest.config.ts`:

```ts
import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
```

`apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

`apps/web/.gitignore`:

```
.next/
next-env.d.ts
data/
*.tsbuildinfo
```

- [ ] **Step 2: Styles, Icon, UI-Komponenten und Hilfsfunktionen übernehmen**

```bash
mkdir -p apps/web/app apps/web/components/ui apps/web/lib apps/web/hooks
cp apps/frontend/src/index.css apps/web/app/globals.css
cp apps/frontend/public/favicon.svg apps/web/app/icon.svg
cp apps/frontend/src/components/ui/*.tsx apps/web/components/ui/
cp apps/frontend/src/lib/utils.ts apps/web/lib/utils.ts
for f in badge button input separator; do
  { printf '"use client"\n\n'; cat "apps/web/components/ui/$f.tsx"; } > "apps/web/components/ui/$f.tsx.tmp"
  mv "apps/web/components/ui/$f.tsx.tmp" "apps/web/components/ui/$f.tsx"
done
head -1 apps/web/components/ui/badge.tsx apps/web/components/ui/dialog.tsx
```
Expected: beide Dateien beginnen mit `"use client"` (`dialog.tsx` hatte es schon). Hintergrund: Base-UI-Komponenten nutzen Hooks und dürfen deshalb nur als Client-Komponenten aus Server Components heraus gerendert werden.

`apps/web/lib/constants.ts`:

```ts
import type { TicketStatus } from '@refinement/shared'

export const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const STATUS_VARIANT: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  backlog:   'outline',
  refining:  'secondary',
  review:    'default',
  ready:     'default',
  failed:    'outline',
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog:   'Backlog',
  refining:  'In Bearbeitung',
  review:    'Review',
  ready:     'Bereit',
  failed:    'Fehlgeschlagen',
}

// Anthropic provides no pricing API — values must be updated manually.
// Last verified: 2026-06-26 — https://docs.anthropic.com/en/docs/about-claude/pricing
export const MODEL_PRICING: Record<string, { inputPerMtok: number; outputPerMtok: number }> = {
  'claude-haiku-4-5-20251001': { inputPerMtok: 1.00,  outputPerMtok:  5.00 },
  'claude-sonnet-4-6':         { inputPerMtok: 3.00,  outputPerMtok: 15.00 },
  'claude-opus-4-7':           { inputPerMtok: 5.00,  outputPerMtok: 25.00 },
}

export const MTOK = 1_000_000
export const CACHE_WRITE_MULTIPLIER = 1.25
export const CACHE_READ_MULTIPLIER = 0.10
```

- [ ] **Step 3: Vorläufige Seiten anlegen**

`apps/web/app/layout.tsx` (wird in Task 6 ersetzt):

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Refinement Engine',
  description: 'AI-gestützte Ticket-Verfeinerung',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
```

`apps/web/app/page.tsx`:

```tsx
export default function HomePage() {
  return <p className="p-6 text-slate-400 text-sm">Ticket auswählen oder neu erstellen</p>
}
```

- [ ] **Step 4: Root-Skript und Root-.gitignore ergänzen**

In `package.json` (Root) im Objekt `scripts` nach `"dev"` ergänzen:

```json
    "dev:web": "npm run dev -w apps/web"
```

An `.gitignore` (Root) anhängen:

```
# Next.js
.next/
```

- [ ] **Step 5: Installieren und bauen**

Run: `npm install && npm run build -w apps/web`
Expected: `next build` endet mit `✓ Compiled successfully` und listet die Route `/`. Next ergänzt dabei ggf. `tsconfig.json` (z. B. `allowJs`) – diese Änderung mit committen.

Run: `npm test -w apps/web`
Expected: `No test files found, exiting with code 0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web package.json package-lock.json .gitignore
git commit -m "feat(web): Next.js-Gerüst mit Tailwind, shadcn-UI und Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Composition Root, Server Actions

**Files:**
- Create: `apps/web/lib/container.ts`
- Create: `apps/web/instrumentation.ts`
- Create: `apps/web/lib/actionResult.ts`, `apps/web/lib/actionResult.test.ts`
- Create: `apps/web/app/actions.ts`, `apps/web/app/actions.test.ts`

- [ ] **Step 1: Failing tests schreiben**

`apps/web/lib/actionResult.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ConflictError, NotFoundError, ValidationError } from '@refinement/core'
import { runAction } from './actionResult'

describe('runAction', () => {
  it('wraps the return value', async () => {
    expect(await runAction(() => 42)).toEqual({ ok: true, data: 42 })
    expect(await runAction(async () => 'x')).toEqual({ ok: true, data: 'x' })
  })

  it('turns domain errors into a failed result with the message', async () => {
    for (const err of [new ConflictError('busy'), new NotFoundError('gone'), new ValidationError('bad')]) {
      expect(await runAction(() => { throw err })).toEqual({ ok: false, error: err.message })
    }
  })

  it('rethrows unexpected errors', async () => {
    await expect(runAction(() => { throw new Error('db down') })).rejects.toThrow('db down')
  })
})
```

`apps/web/app/actions.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictError } from '@refinement/core'

const engine = vi.hoisted(() => ({
  createTicket: vi.fn(),
  startRefinement: vi.fn(),
  answerQuestion: vi.fn(),
  stopRefinement: vi.fn(),
  deleteTicket: vi.fn(),
  resetSystem: vi.fn(),
}))

vi.mock('@/lib/container', () => ({ getEngine: () => engine }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import {
  createTicketAction,
  startRefinementAction,
  answerQuestionAction,
  stopRefinementAction,
  deleteTicketAction,
  resetSystemAction,
} from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server actions', () => {
  it('createTicketAction returns the ticket and refreshes the whole layout', async () => {
    engine.createTicket.mockReturnValue({ id: 'T-4', title: 'Neu' })
    const result = await createTicketAction({ title: 'Neu', description: 'D' })
    expect(result).toEqual({ ok: true, data: { id: 'T-4', title: 'Neu' } })
    expect(engine.createTicket).toHaveBeenCalledWith({ title: 'Neu', description: 'D' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('passes ticket id and input through to the use cases', async () => {
    const input = { repo: 'https://github.com/x/y', model: 'm', acceptanceCriteria: '' }
    await startRefinementAction('T-1', input)
    await answerQuestionAction('T-1', { answer: 'Postgres' })
    await deleteTicketAction('T-2')
    expect(engine.startRefinement).toHaveBeenCalledWith('T-1', input)
    expect(engine.answerQuestion).toHaveBeenCalledWith('T-1', { answer: 'Postgres' })
    expect(engine.deleteTicket).toHaveBeenCalledWith('T-2')
  })

  it('awaits the asynchronous use cases', async () => {
    engine.stopRefinement.mockResolvedValue(undefined)
    engine.resetSystem.mockResolvedValue([{ id: 'T-1' }])
    expect(await stopRefinementAction('T-1')).toEqual({ ok: true, data: undefined })
    expect(await resetSystemAction()).toEqual({ ok: true, data: [{ id: 'T-1' }] })
  })

  it('reports domain errors as a failed result', async () => {
    engine.startRefinement.mockImplementation(() => {
      throw new ConflictError('Ticket is not in a refineable state')
    })
    const result = await startRefinementAction('T-1', { repo: 'r', model: 'm', acceptanceCriteria: '' })
    expect(result).toEqual({ ok: false, error: 'Ticket is not in a refineable state' })
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w apps/web`
Expected: FAIL – `Failed to resolve import "./actionResult"` bzw. `"./actions"`.

- [ ] **Step 3: Implementierung**

`apps/web/lib/container.ts`:

```ts
import path from 'path'
import { createRefinementEngine, resolveCorePaths, type UseCases } from '@refinement/core'

const globalForEngine = globalThis as typeof globalThis & { __refinementEngine?: UseCases }

/**
 * Composition root of the web app: one engine per process.
 * Kept on globalThis because Next.js loads modules into several bundles (pages, actions,
 * route handlers) and reloads them in dev — all must share the same database connection,
 * event bus and running agent processes.
 */
export function getEngine(): UseCases {
  if (!globalForEngine.__refinementEngine) {
    // `next dev` / `next start` run with apps/web as working directory (npm -w).
    const coreDir = path.resolve(process.cwd(), '..', '..', 'packages', 'core')
    const engine = createRefinementEngine({
      dbPath: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'refinement.db'),
      ...resolveCorePaths(coreDir),
    })
    engine.startup()
    globalForEngine.__refinementEngine = engine
  }
  return globalForEngine.__refinementEngine
}
```

`apps/web/instrumentation.ts`:

```ts
/**
 * Runs once when the Next.js server starts. Creating the engine here applies migrations,
 * seeds an empty database and recovers crashed runs before the first request — and makes
 * a broken database fail the start instead of the first page view.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEngine } = await import('./lib/container')
    getEngine()
  }
}
```

`apps/web/lib/actionResult.ts`:

```ts
import { errorCode } from '@refinement/core'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Runs a use case inside a Server Action. Domain errors (not found, conflict, validation)
 * become `{ ok: false }` so the UI can show them; anything else is rethrown for `error.tsx`.
 */
export async function runAction<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (errorCode(err)) return { ok: false, error: (err as Error).message }
    throw err
  }
}
```

`apps/web/app/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { TicketDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { runAction, type ActionResult } from '@/lib/actionResult'

/** The sidebar list and the ticket pages both show ticket state — refresh the whole tree. */
function refreshAll(): void {
  revalidatePath('/', 'layout')
}

export async function createTicketAction(
  input: { title: string; description: string },
): Promise<ActionResult<TicketDto>> {
  const result = await runAction(() => getEngine().createTicket(input))
  refreshAll()
  return result
}

export async function startRefinementAction(
  ticketId: string,
  input: { repo: string; model: string; acceptanceCriteria: string },
): Promise<ActionResult> {
  const result = await runAction(() => getEngine().startRefinement(ticketId, input))
  refreshAll()
  return result
}

export async function answerQuestionAction(ticketId: string, input: { answer: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().answerQuestion(ticketId, input))
  refreshAll()
  return result
}

export async function stopRefinementAction(ticketId: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().stopRefinement(ticketId))
  refreshAll()
  return result
}

export async function deleteTicketAction(ticketId: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().deleteTicket(ticketId))
  refreshAll()
  return result
}

export async function resetSystemAction(): Promise<ActionResult<TicketDto[]>> {
  const result = await runAction(() => getEngine().resetSystem())
  refreshAll()
  return result
}
```

- [ ] **Step 4: Tests laufen lassen – müssen grün sein**

Run: `npm test -w apps/web`
Expected: PASS (actionResult 3, actions 4).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): Composition Root, instrumentation und Server Actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: SSE-Route Handler

**Files:**
- Create: `apps/web/app/api/events/route.ts`
- Create: `apps/web/app/api/events/route.test.ts`

- [ ] **Step 1: Failing test schreiben**

`apps/web/app/api/events/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w apps/web -- app/api/events`
Expected: FAIL – `Failed to resolve import "./route"`.

- [ ] **Step 3: Implementierung**

`apps/web/app/api/events/route.ts`:

```ts
import { getEngine } from '@/lib/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

/**
 * Server-Sent Events for one ticket: `GET /api/events?ticketId=T-1`.
 * One subscription per connection; it is removed when the browser disconnects,
 * so several tabs per ticket work independently.
 */
export function GET(request: Request): Response {
  const ticketId = new URL(request.url).searchParams.get('ticketId')
  if (!ticketId) {
    return Response.json({ error: 'ticketId query parameter is required' }, { status: 400 })
  }

  let closed = false
  let unsubscribe = () => {}
  const stop = () => {
    if (closed) return
    closed = true
    unsubscribe()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Comment frame flushes proxy buffers; EventSource ignores it.
      controller.enqueue(encoder.encode(': ok\n\n'))
      unsubscribe = getEngine().subscribeToTicket(ticketId, (event) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })
      const onAbort = () => {
        if (closed) return
        stop()
        controller.close()
      }
      // The client may already be gone before the listener exists — the abort event would never fire.
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort)
    },
    cancel: stop,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w apps/web -- app/api/events`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api
git commit -m "feat(web): SSE-Route-Handler auf dem Event-Bus des Kerns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client-Hooks `useSSE` und `useElapsedSeconds`

**Files:**
- Create: `apps/web/hooks/useSSE.ts`, `apps/web/hooks/useSSE.test.tsx`
- Create: `apps/web/hooks/useElapsedSeconds.ts`

`useSSE` bekommt Callbacks statt eines `lastMessage`-States: Mehrere Events im selben Render-Tick gingen sonst verloren.

- [ ] **Step 1: Failing test schreiben**

`apps/web/hooks/useSSE.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from './useSSE'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
}

const latest = () => FakeEventSource.instances.at(-1)!

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSSE', () => {
  it('connects to the ticket stream', () => {
    renderHook(() => useSSE('T-1', { onMessage: vi.fn() }))
    expect(latest().url).toBe('/api/events?ticketId=T-1')
  })

  it('passes every parsed event to onMessage and marks the connection', () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => useSSE('T-1', { onMessage }))

    act(() => {
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketId: 'T-1', message: 'a' }) })
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketId: 'T-1', message: 'b' }) })
    })

    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'progress', ticketId: 'T-1', message: 'a' })
    expect(onMessage).toHaveBeenNthCalledWith(2, { type: 'progress', ticketId: 'T-1', message: 'b' })
    expect(result.current).toEqual({ connected: true, everConnected: true })
  })

  it('calls onReconnect only when the connection opens again', () => {
    const onReconnect = vi.fn()
    renderHook(() => useSSE('T-1', { onMessage: vi.fn(), onReconnect }))

    act(() => latest().onopen?.())
    expect(onReconnect).not.toHaveBeenCalled()
    act(() => latest().onopen?.())
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('reports a lost connection but remembers that it was connected', () => {
    const { result } = renderHook(() => useSSE('T-1', { onMessage: vi.fn() }))
    act(() => latest().onopen?.())
    act(() => latest().onerror?.())
    expect(result.current).toEqual({ connected: false, everConnected: true })
  })

  it('closes the connection on unmount and when the ticket changes', () => {
    const { rerender, unmount } = renderHook(({ id }) => useSSE(id, { onMessage: vi.fn() }), {
      initialProps: { id: 'T-1' },
    })
    const first = latest()
    rerender({ id: 'T-2' })
    expect(first.closed).toBe(true)
    expect(latest().url).toBe('/api/events?ticketId=T-2')
    unmount()
    expect(latest().closed).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w apps/web -- hooks`
Expected: FAIL – `Failed to resolve import "./useSSE"`.

- [ ] **Step 3: Implementierung**

`apps/web/hooks/useSSE.ts`:

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefinementEvent } from '@refinement/shared'

export interface SSEHandlers {
  onMessage: (event: RefinementEvent) => void
  /** Called when the browser re-established a lost connection (events may have been missed). */
  onReconnect?: () => void
}

/**
 * Subscribes to `/api/events?ticketId=<id>`. EventSource reconnects automatically.
 *
 * `intentionallyClosed` prevents `onerror` from reporting a lost connection when the effect
 * cleans up — `EventSource.close()` triggers `onerror` in some browsers.
 *
 * @returns `connected` while the stream is open; `everConnected` latches on first success to
 *          distinguish "not yet connected" from "connection lost".
 */
export function useSSE(ticketId: string, handlers: SSEHandlers) {
  const [connected, setConnected] = useState(false)
  const [everConnected, setEverConnected] = useState(false)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    let intentionallyClosed = false
    let openedBefore = false
    const es = new EventSource(`/api/events?ticketId=${encodeURIComponent(ticketId)}`)

    const markConnected = () => {
      setConnected(true)
      setEverConnected(true)
    }

    es.onopen = () => {
      markConnected()
      if (openedBefore) handlersRef.current.onReconnect?.()
      openedBefore = true
    }

    es.onmessage = (e) => {
      // Some proxies suppress onopen — make sure the flags are set before any message.
      markConnected()
      handlersRef.current.onMessage(JSON.parse(e.data) as RefinementEvent)
    }

    es.onerror = () => {
      if (intentionallyClosed) return
      setConnected(false)
      console.warn('SSE error for ticket', ticketId)
    }

    return () => {
      intentionallyClosed = true
      es.close()
      setConnected(false)
    }
  }, [ticketId])

  return { connected, everConnected }
}
```

`apps/web/hooks/useElapsedSeconds.ts` (unverändert aus `apps/frontend/src/components/TicketDetail.tsx` übernommen):

```ts
'use client'

import { useEffect, useRef, useState } from 'react'

const MS_PER_SECOND = 1000

/**
 * Seconds the agent has been working. Pauses while `isRunning` is false (e.g. waiting for an
 * answer) and resets to 0 when `shouldReset` is true.
 */
export function useElapsedSeconds(isRunning: boolean, shouldReset: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const pausedRef = useRef(0)

  useEffect(() => {
    if (shouldReset) {
      pausedRef.current = 0
      startTimeRef.current = null
      return
    }
    if (!isRunning) {
      if (startTimeRef.current !== null) {
        pausedRef.current += Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND)
        startTimeRef.current = null
      }
      return
    }
    const offset = pausedRef.current
    startTimeRef.current = Date.now()
    const resetId = setTimeout(() => setElapsed(offset), 0)
    const id = setInterval(() => {
      if (startTimeRef.current === null) return
      setElapsed(offset + Math.floor((Date.now() - startTimeRef.current) / MS_PER_SECOND))
    }, MS_PER_SECOND)
    return () => {
      clearTimeout(resetId)
      clearInterval(id)
    }
  }, [isRunning, shouldReset])

  return shouldReset ? 0 : elapsed
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w apps/web -- hooks`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks
git commit -m "feat(web): useSSE mit Callbacks und Reconnect, useElapsedSeconds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: App-Zustand und Sidebar

**Files:**
- Create: `apps/web/components/AppStateProvider.tsx`
- Create: `apps/web/components/RepoSettings.tsx`
- Create: `apps/web/components/ResetButton.tsx`
- Create: `apps/web/components/TicketList.tsx`
- Create: `apps/web/components/CreateTicketDialog.tsx`, `apps/web/components/CreateTicketDialog.test.tsx`
- Create: `apps/web/components/Sidebar.tsx`
- Rewrite: `apps/web/app/layout.tsx`

- [ ] **Step 1: Failing test schreiben**

`apps/web/components/CreateTicketDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/app/actions', () => ({ createTicketAction: vi.fn() }))

import { createTicketAction } from '@/app/actions'
import { CreateTicketDialog } from './CreateTicketDialog'

beforeEach(() => {
  vi.clearAllMocks()
})

async function openAndFill(title: string, description: string) {
  render(<CreateTicketDialog />)
  fireEvent.click(screen.getByRole('button', { name: '+ Neues Ticket' }))
  fireEvent.change(await screen.findByLabelText('Titel'), { target: { value: title } })
  fireEvent.change(screen.getByLabelText('Beschreibung'), { target: { value: description } })
}

describe('CreateTicketDialog', () => {
  it('disables submit until title and description are filled', async () => {
    await openAndFill('Neu', '')
    expect(screen.getByRole('button', { name: 'Ticket erstellen' })).toBeDisabled()
  })

  it('creates the ticket and opens it', async () => {
    vi.mocked(createTicketAction).mockResolvedValue({ ok: true, data: { id: 'T-7' } as never })
    await openAndFill('Neu', 'Beschreibung')

    fireEvent.click(screen.getByRole('button', { name: 'Ticket erstellen' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/tickets/T-7'))
    expect(createTicketAction).toHaveBeenCalledWith({ title: 'Neu', description: 'Beschreibung' })
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(createTicketAction).mockResolvedValue({ ok: false, error: 'Titel ist erforderlich' })
    await openAndFill('Neu', 'Beschreibung')

    fireEvent.click(screen.getByRole('button', { name: 'Ticket erstellen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Titel ist erforderlich')
    expect(router.push).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w apps/web -- components/CreateTicketDialog`
Expected: FAIL – `Failed to resolve import "./CreateTicketDialog"`.

- [ ] **Step 3: Implementierung**

`apps/web/components/AppStateProvider.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const REPO_URL_KEY = 'repoUrl'

export interface AppState {
  /** null until localStorage has been read on the client. */
  repoUrl: string | null
  setRepoUrl(url: string): void
  progressLogs: Record<string, string[]>
  appendProgress(ticketId: string, message: string): void
  clearProgress(): void
}

const AppStateContext = createContext<AppState | null>(null)

/**
 * Client state that must survive navigation between tickets: the target repository
 * (persisted in localStorage) and the live progress log per ticket. Lives in the root layout,
 * which App Router keeps mounted across navigations.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [repoUrl, setRepoUrlState] = useState<string | null>(null)
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  useEffect(() => {
    setRepoUrlState(localStorage.getItem(REPO_URL_KEY) ?? '')
  }, [])

  const setRepoUrl = useCallback((url: string) => {
    localStorage.setItem(REPO_URL_KEY, url)
    setRepoUrlState(url)
  }, [])

  const appendProgress = useCallback((ticketId: string, message: string) => {
    setProgressLogs((prev) => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), message] }))
  }, [])

  const clearProgress = useCallback(() => setProgressLogs({}), [])

  const value = useMemo(
    () => ({ repoUrl, setRepoUrl, progressLogs, appendProgress, clearProgress }),
    [repoUrl, setRepoUrl, progressLogs, appendProgress, clearProgress],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
```

`apps/web/components/RepoSettings.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Label } from './ui/label'
import { useAppState } from './AppStateProvider'

/** Repository URL used for new refinements; edited inline, stored in localStorage. */
export function RepoSettings() {
  const { repoUrl, setRepoUrl } = useAppState()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  const confirm = () => {
    const url = draft.trim()
    if (!url) return
    setRepoUrl(url)
    setEditing(false)
  }

  const startEdit = () => {
    setDraft(repoUrl ?? '')
    setEditing(true)
  }

  return (
    <div className="p-3 border-b border-slate-200 space-y-2">
      <Label className="text-xs text-slate-500">Repository</Label>
      {repoUrl === null ? null : editing || repoUrl === '' ? (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
            placeholder="Repository URL"
            autoComplete="off"
            name="refinement-engine-repo-xk92"
            autoFocus={repoUrl !== ''}
            className="input-sm"
          />
          <button onClick={confirm} disabled={!draft.trim()} className="btn-ghost-xs disabled:opacity-40">
            Setzen
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="break-all text-xs font-mono text-muted-foreground">{repoUrl}</p>
          <button onClick={startEdit} className="btn-ghost-xs">
            Ändern
          </button>
        </div>
      )}
    </div>
  )
}
```

`apps/web/components/ResetButton.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

export function ResetButton() {
  const router = useRouter()
  const { clearProgress } = useAppState()
  const [pending, startTransition] = useTransition()

  const handleReset = () =>
    startTransition(async () => {
      await resetSystemAction()
      clearProgress()
      router.push('/')
    })

  return (
    <button
      onClick={handleReset}
      disabled={pending}
      className="btn-ghost-xs shrink-0"
      title="Auf CC-Seed-Tickets zurücksetzen"
    >
      Reset
    </button>
  )
}
```

`apps/web/components/TicketList.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { TicketDto } from '@refinement/shared'
import { STATUS_LABEL, STATUS_VARIANT } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'

/** Sidebar list; a client component only because it highlights the ticket of the current URL. */
export function TicketList({ tickets }: { tickets: TicketDto[] }) {
  const pathname = usePathname()

  return (
    <ul className="list-none p-0 m-0">
      {tickets.map((ticket) => {
        const active = pathname === `/tickets/${ticket.id}`
        return (
          <li key={ticket.id}>
            <Link
              href={`/tickets/${ticket.id}`}
              className={`block w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-l-2 ${
                active ? 'border-slate-900 bg-slate-50' : 'border-transparent'
              }`}
            >
              <div className="font-medium text-sm truncate">{ticket.title}</div>
              <Badge variant={STATUS_VARIANT[ticket.status]} className="mt-1 text-xs">
                {STATUS_LABEL[ticket.status]}
              </Badge>
            </Link>
            <Separator />
          </li>
        )
      })}
    </ul>
  )
}
```

`apps/web/components/CreateTicketDialog.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTicketAction } from '@/app/actions'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

export function CreateTicketDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await createTicketAction({ title, description })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setTitle('')
      setDescription('')
      router.push(`/tickets/${result.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        + Neues Ticket
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Ticket erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Was soll implementiert werden?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Kontext, Motivation, bekannte Constraints…"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !description.trim()}
            className="w-full"
          >
            {saving ? 'Erstelle…' : 'Ticket erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

`apps/web/components/Sidebar.tsx`:

```tsx
import type { TicketDto } from '@refinement/shared'
import { Separator } from './ui/separator'
import { RepoSettings } from './RepoSettings'
import { CreateTicketDialog } from './CreateTicketDialog'
import { ResetButton } from './ResetButton'
import { TicketList } from './TicketList'

export function Sidebar({ tickets }: { tickets: TicketDto[] }) {
  return (
    <aside className="min-w-64 w-auto border-r border-slate-200 flex flex-col shrink-0">
      <div className="px-4 py-3 font-semibold text-sm tracking-wide text-slate-500 uppercase">Tickets</div>
      <Separator />
      <RepoSettings />
      <div className="p-3 border-b border-slate-200 flex items-center gap-2">
        <div className="flex-1">
          <CreateTicketDialog />
        </div>
        <ResetButton />
      </div>
      <div className="overflow-y-auto flex-1">
        <TicketList tickets={tickets} />
      </div>
    </aside>
  )
}
```

`apps/web/app/layout.tsx` (komplett ersetzen):

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getEngine } from '@/lib/container'
import { AppStateProvider } from '@/components/AppStateProvider'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

// Every page reads live data from the local database — never prerender.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Refinement Engine',
  description: 'AI-gestützte Ticket-Verfeinerung',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const tickets = getEngine().listTickets()

  return (
    <html lang="de">
      <body>
        <AppStateProvider>
          <div className="flex h-screen bg-white text-slate-900">
            <Sidebar tickets={tickets} />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w apps/web -- components/CreateTicketDialog`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): Sidebar mit Repo-Einstellung, Ticket-Liste, Anlegen und Reset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ticket-Detail

**Files:**
- Create: `apps/web/components/ModelSelect.tsx`
- Create: `apps/web/components/TicketMetaRow.tsx`
- Create: `apps/web/components/AgentRunningCard.tsx`
- Create: `apps/web/components/PlanSection.tsx`
- Create: `apps/web/components/QuestionPanel.tsx`, `apps/web/components/QuestionPanel.test.tsx`
- Create: `apps/web/components/TicketLive.tsx`, `apps/web/components/TicketLive.test.tsx`
- Create: `apps/web/components/TicketDetail.tsx`
- Create: `apps/web/app/tickets/[id]/page.tsx`, `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx`

- [ ] **Step 1: Failing tests schreiben**

`apps/web/components/QuestionPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions', () => ({ answerQuestionAction: vi.fn() }))

import { answerQuestionAction } from '@/app/actions'
import { QuestionPanel } from './QuestionPanel'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuestionPanel', () => {
  it('shows the question and disables sending an empty answer', () => {
    render(<QuestionPanel ticketId="T-1" question="Welche DB?" onAnswered={vi.fn()} />)
    expect(screen.getByText('Welche DB?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antworten' })).toBeDisabled()
  })

  it('sends the answer and notifies the parent', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    const onAnswered = vi.fn()
    render(<QuestionPanel ticketId="T-1" question="Welche DB?" onAnswered={onAnswered} />)

    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben...'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    await waitFor(() => expect(onAnswered).toHaveBeenCalled())
    expect(answerQuestionAction).toHaveBeenCalledWith('T-1', { answer: 'Postgres' })
  })

  it('keeps the answer and shows the error when the action fails', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: false, error: 'Answer already in progress' })
    const onAnswered = vi.fn()
    render(<QuestionPanel ticketId="T-1" question="Welche DB?" onAnswered={onAnswered} />)

    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben...'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Answer already in progress')
    expect(onAnswered).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Antwort eingeben...')).toHaveValue('Postgres')
  })
})
```

`apps/web/components/TicketLive.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { RefinementEvent, TicketDetailDto } from '@refinement/shared'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

vi.mock('@/app/actions', () => ({
  startRefinementAction: vi.fn(),
  stopRefinementAction: vi.fn(),
  deleteTicketAction: vi.fn(),
  answerQuestionAction: vi.fn(),
}))

const sse = vi.hoisted(() => ({
  handlers: null as null | { onMessage: (e: RefinementEvent) => void; onReconnect?: () => void },
}))
vi.mock('@/hooks/useSSE', () => ({
  useSSE: (_ticketId: string, handlers: { onMessage: (e: RefinementEvent) => void }) => {
    sse.handlers = handlers
    return { connected: true, everConnected: true }
  },
}))

import { startRefinementAction, deleteTicketAction, answerQuestionAction } from '@/app/actions'
import { AppStateProvider } from './AppStateProvider'
import { TicketLive } from './TicketLive'
import { DEFAULT_MODEL } from '@/lib/constants'

const NOW = new Date('2026-10-28T10:00:00Z')

const BACKLOG: TicketDetailDto = {
  id: 'T-1', title: 'CC-2', description: 'Desc', status: 'backlog', iteration: 0,
  createdAt: NOW, updatedAt: NOW, latestRun: null,
}

const WAITING_FOR_ANSWER: TicketDetailDto = {
  ...BACKLOG,
  status: 'refining',
  iteration: 1,
  latestRun: {
    id: 'run-1', ticketId: 'T-1', iteration: 1, trigger: 'initial', status: 'succeeded', model: DEFAULT_MODEL,
    output: { type: 'question', question: 'Welche DB?' }, costUsd: 0.01, inputTokens: 100,
    cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 10, startedAt: NOW, finishedAt: NOW,
  },
}

function renderLive(ticket: TicketDetailDto) {
  return render(
    <AppStateProvider>
      <TicketLive ticket={ticket}>
        <p>Beschreibung</p>
      </TicketLive>
    </AppStateProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('TicketLive', () => {
  it('disables Refine without a repository', async () => {
    renderLive(BACKLOG)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled())
  })

  it('starts a refinement with the stored repository and the default model', async () => {
    localStorage.setItem('repoUrl', 'https://github.com/x/y')
    vi.mocked(startRefinementAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(BACKLOG)

    const refine = screen.getByRole('button', { name: 'Refine' })
    await waitFor(() => expect(refine).toBeEnabled())
    fireEvent.click(refine)

    await waitFor(() =>
      expect(startRefinementAction).toHaveBeenCalledWith('T-1', {
        repo: 'https://github.com/x/y', model: DEFAULT_MODEL, acceptanceCriteria: '',
      }),
    )
  })

  it('shows the error returned by an action', async () => {
    localStorage.setItem('repoUrl', 'https://github.com/x/y')
    vi.mocked(startRefinementAction).mockResolvedValue({ ok: false, error: 'Ticket is not in a refineable state' })
    renderLive(BACKLOG)

    const refine = screen.getByRole('button', { name: 'Refine' })
    await waitFor(() => expect(refine).toBeEnabled())
    fireEvent.click(refine)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket is not in a refineable state')
  })

  it('navigates home after deleting', async () => {
    vi.mocked(deleteTicketAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(BACKLOG)

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'))
    expect(deleteTicketAction).toHaveBeenCalledWith('T-1')
  })

  it('shows the pending question and hides it once answered', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(WAITING_FOR_ANSWER)

    expect(screen.getByText('Welche DB?')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben...'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    await waitFor(() => expect(screen.queryByText('Welche DB?')).not.toBeInTheDocument())
  })

  it('appends progress events and refreshes the page on status and question events', () => {
    renderLive({ ...WAITING_FOR_ANSWER, latestRun: { ...WAITING_FOR_ANSWER.latestRun!, status: 'running', output: null } })

    act(() => sse.handlers!.onMessage({ type: 'progress', ticketId: 'T-1', message: 'Codebase wird analysiert...' }))
    expect(screen.getByText('Codebase wird analysiert...')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()

    act(() => sse.handlers!.onMessage({ type: 'status', ticketId: 'T-1', status: 'review' }))
    act(() => sse.handlers!.onMessage({ type: 'question', ticketId: 'T-1', question: 'Q?' }))
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })

  it('renders the server-rendered children', () => {
    renderLive(BACKLOG)
    expect(screen.getByText('Beschreibung')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w apps/web -- components/QuestionPanel components/TicketLive`
Expected: FAIL – `Failed to resolve import "./QuestionPanel"` bzw. `"./TicketLive"`.

- [ ] **Step 3: Implementierung der Detail-Bausteine**

`apps/web/components/ModelSelect.tsx`:

```tsx
'use client'

import { MODELS } from '@/lib/constants'

interface Props {
  value: string
  onChange: (model: string) => void
  /** Disables the select while refinement is running. */
  disabled?: boolean
  /** 'sm' renders a compact inline variant; 'md' (default) renders full-width. */
  size?: 'sm' | 'md'
}

/** Dropdown for picking the Claude model used for a ticket's refinement. */
export function ModelSelect({ value, onChange, disabled = false, size = 'md' }: Props) {
  const className = size === 'sm' ? 'select-sm' : 'select-md'
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={className}>
      {MODELS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
```

`apps/web/components/TicketMetaRow.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import type { AgentRunDto, RefinementOutput } from '@refinement/shared'
import { CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, MODEL_PRICING, MTOK } from '@/lib/constants'
import { formatElapsed } from '@/lib/utils'
import { ModelSelect } from './ModelSelect'

interface Props {
  model: string
  canRefine: boolean
  onModelChange: (model: string) => void
  durationSeconds?: number
  latestRun?: AgentRunDto
  refinementOutput?: RefinementOutput | null
}

const TOKENS_PER_K = 1000

/** Single label/value pair in the metadata row. */
function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{label}:</span>
      <span className="text-xs text-slate-700 font-mono">{children}</span>
    </div>
  )
}

/** Formats a token count as a compact string, e.g. 1500 → "1.5K". */
function formatTokens(n: number) {
  if (n < TOKENS_PER_K) return String(n)
  const k = n / TOKENS_PER_K
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
}

/**
 * Cost of a run: the reported `costUsd` if available, otherwise estimated from the
 * pricing table and token counts.
 */
function CostDisplay({ run, model }: { run: AgentRunDto; model: string }) {
  const cost = (() => {
    if (run.costUsd !== null && run.costUsd > 0) return run.costUsd
    const pricing = MODEL_PRICING[model]
    if (!pricing || run.inputTokens == null || run.outputTokens == null) return undefined
    return (run.inputTokens / MTOK) * pricing.inputPerMtok
         + ((run.cacheCreationTokens ?? 0) / MTOK) * pricing.inputPerMtok * CACHE_WRITE_MULTIPLIER
         + ((run.cacheReadTokens ?? 0) / MTOK) * pricing.inputPerMtok * CACHE_READ_MULTIPLIER
         + (run.outputTokens / MTOK) * pricing.outputPerMtok
  })()
  if (cost === undefined || cost === 0) return <span>—</span>
  return <span>${cost < 0.001 ? cost.toFixed(6) : cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}</span>
}

/** Model selector, run duration, token usage, cost and confidence below the ticket title. */
export function TicketMetaRow({ model, canRefine, onModelChange, durationSeconds, latestRun, refinementOutput }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <MetaItem label="Modell">
        <ModelSelect value={model} onChange={onModelChange} disabled={!canRefine} size="sm" />
      </MetaItem>
      {durationSeconds !== undefined && <MetaItem label="Dauer">{formatElapsed(durationSeconds)}</MetaItem>}
      {latestRun?.inputTokens != null && (
        <MetaItem label="Tokenverbrauch">
          {formatTokens((latestRun.inputTokens ?? 0) + (latestRun.cacheCreationTokens ?? 0))}↑
          {' '}{formatTokens(latestRun.outputTokens ?? 0)}↓
        </MetaItem>
      )}
      {latestRun?.inputTokens != null && (
        <MetaItem label="Kosten"><CostDisplay run={latestRun} model={model} /></MetaItem>
      )}
      {refinementOutput?.confidence !== undefined && (
        <MetaItem label="Analysequalität">{refinementOutput.confidence}%</MetaItem>
      )}
    </div>
  )
}
```

`apps/web/components/AgentRunningCard.tsx`:

```tsx
'use client'

import { formatElapsed } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  elapsed: number
  progressLog: string[]
  connected: boolean
  everConnected: boolean
}

/** Shown while the agent runs: pulse indicator, elapsed time, progress log, connection warning. */
export function AgentRunningCard({ elapsed, progressLog, connected, everConnected }: Props) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <span className="pulse-indicator" />
          Agent läuft
          <span className="font-mono normal-case tracking-normal text-slate-400">{formatElapsed(elapsed)}</span>
          {everConnected && !connected && (
            <span className="ml-auto text-amber-600 normal-case tracking-normal font-normal">
              ⚠ Verbindung unterbrochen
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {progressLog.length === 0 ? (
          <p className="text-xs text-slate-400 font-mono">Warte auf Agent...</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {progressLog.map((msg, i) => (
              <p key={i} className="text-xs font-mono text-slate-600">
                {msg}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

`apps/web/components/PlanSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { RefinementOutput } from '@refinement/shared'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

/** Collapsible refinement result rendered as Markdown. */
export function PlanSection({ output }: { output: RefinementOutput }) {
  const [open, setOpen] = useState(false)
  const blocking = output.openQuestions.filter((q) => q.blocksImplementation)
  const plan = [
    output.userStory ? `## User Story\n${output.userStory}` : '',
    output.acceptanceCriteria.length
      ? `## Akzeptanzkriterien\n${output.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`
      : '',
    output.affectedFiles.length
      ? `## Betroffene Dateien\n${output.affectedFiles.map((f) => `- **${f.path}**: ${f.description}`).join('\n')}`
      : '',
    output.risks.length
      ? `## Risiken\n${output.risks.map((r) => `- [${r.severity}] ${r.description}`).join('\n')}`
      : '',
    blocking.length
      ? `## Offene Fragen (blockierend)\n${blocking.map((q) => `- ${q.question}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center justify-between">
          Agent-Run
          <span className="text-slate-400 text-xs font-normal">{open ? '▲ einklappen' : '▼ ausklappen'}</span>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="prose-plan">
            <ReactMarkdown>{plan}</ReactMarkdown>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
```

`apps/web/components/QuestionPanel.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { answerQuestionAction } from '@/app/actions'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  ticketId: string
  /** Question asked by the agent. */
  question: string
  /** Called after the answer was accepted. */
  onAnswered: () => void
}

/** Amber card shown while the agent waits for a human answer. */
export function QuestionPanel({ ticketId, question, onAnswered }: Props) {
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!answer.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await answerQuestionAction(ticketId, { answer })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAnswer('')
      onAnswered()
    })
  }

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-900">Frage vom Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{question}</p>
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Antwort eingeben..." />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={handleSubmit} disabled={sending || !answer.trim()} size="sm">
          {sending ? 'Sende...' : 'Antworten'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

`apps/web/components/TicketLive.tsx`:

```tsx
'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetailDto } from '@refinement/shared'
import { deleteTicketAction, startRefinementAction, stopRefinementAction } from '@/app/actions'
import type { ActionResult } from '@/lib/actionResult'
import { DEFAULT_MODEL } from '@/lib/constants'
import { useSSE } from '@/hooks/useSSE'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useAppState } from './AppStateProvider'
import { AgentRunningCard } from './AgentRunningCard'
import { QuestionPanel } from './QuestionPanel'
import { TicketMetaRow } from './TicketMetaRow'
import { Button } from './ui/button'

const MS_PER_SECOND = 1000

interface Props {
  ticket: TicketDetailDto
  /** Server-rendered static content shown between the meta row and the action buttons. */
  children: ReactNode
}

/**
 * Interactive part of the ticket page. Live events update the progress log directly;
 * status and question events refresh the server-rendered page (`router.refresh()`), which
 * delivers the new ticket state as props.
 */
export function TicketLive({ ticket, children }: Props) {
  const router = useRouter()
  const { repoUrl, progressLogs, appendProgress } = useAppState()
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [answeredRunId, setAnsweredRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const { connected, everConnected } = useSSE(ticket.id, {
    onMessage: (event) => {
      if (event.type === 'progress') appendProgress(ticket.id, event.message)
      else router.refresh()
    },
    onReconnect: () => router.refresh(),
  })

  const latestRun = ticket.latestRun
  const isAgentRunning = ticket.status === 'refining'
  const canRefine = ticket.status === 'backlog' || ticket.status === 'review'
  const repo = repoUrl ?? ''

  // The answer run is created in the background; until the page refreshes, the question run
  // is still the latest — hide its question as soon as it was answered.
  const pendingQuestion =
    isAgentRunning && latestRun?.status === 'succeeded' && latestRun.output?.type === 'question'
      && latestRun.id !== answeredRunId
      ? latestRun.output.question
      : null

  const elapsed = useElapsedSeconds(isAgentRunning && !pendingQuestion, !isAgentRunning)
  const refinementOutput = latestRun?.output?.type === 'refinement' ? latestRun.output.result : null
  const durationSeconds = latestRun?.finishedAt
    ? Math.round((latestRun.finishedAt.getTime() - latestRun.startedAt.getTime()) / MS_PER_SECOND)
    : undefined

  const run = (action: () => Promise<ActionResult<unknown>>, onSuccess?: () => void) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (!result.ok) {
        setError(result.error)
        return
      }
      onSuccess?.()
    })

  return (
    <>
      <TicketMetaRow
        model={model}
        canRefine={canRefine}
        onModelChange={setModel}
        durationSeconds={durationSeconds}
        latestRun={latestRun ?? undefined}
        refinementOutput={refinementOutput}
      />

      {children}

      <div className="flex gap-2">
        <Button
          disabled={!canRefine || !repo || pending}
          onClick={() => run(() => startRefinementAction(ticket.id, { repo, model, acceptanceCriteria: '' }))}
          title={!repo ? 'Repository-URL eingeben' : undefined}
        >
          Refine
        </Button>
        {isAgentRunning && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => stopRefinementAction(ticket.id))}>
            Stoppen
          </Button>
        )}
        <Button
          variant="outline"
          disabled={isAgentRunning || pending}
          onClick={() => run(() => deleteTicketAction(ticket.id), () => router.push('/'))}
        >
          Löschen
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {isAgentRunning && (
        <AgentRunningCard
          elapsed={elapsed}
          progressLog={progressLogs[ticket.id] ?? []}
          connected={connected}
          everConnected={everConnected}
        />
      )}

      {pendingQuestion && latestRun && (
        <QuestionPanel ticketId={ticket.id} question={pendingQuestion} onAnswered={() => setAnsweredRunId(latestRun.id)} />
      )}
    </>
  )
}
```

`apps/web/components/TicketDetail.tsx`:

```tsx
import type { TicketDetailDto } from '@refinement/shared'
import { STATUS_VARIANT } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { TicketLive } from './TicketLive'
import { PlanSection } from './PlanSection'

/** Server-rendered ticket page; the interactive parts live in TicketLive. */
export function TicketDetail({ ticket }: { ticket: TicketDetailDto }) {
  const output = ticket.latestRun?.output
  const refinementOutput = output?.type === 'refinement' ? output.result : null

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{ticket.title}</h2>
        <Badge variant={STATUS_VARIANT[ticket.status]} className="shrink-0">
          {ticket.status}
        </Badge>
      </div>

      {/* key: navigating to another ticket must reset model, error and answer state */}
      <TicketLive key={ticket.id} ticket={ticket}>
        <Separator />
        <section>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Beschreibung</h3>
          <p className="text-sm text-slate-700">{ticket.description}</p>
        </section>
      </TicketLive>

      {refinementOutput && <PlanSection output={refinementOutput} />}
    </div>
  )
}
```

- [ ] **Step 4: Seiten anlegen**

`apps/web/app/tickets/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { errorCode } from '@refinement/core'
import type { TicketDetailDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { TicketDetail } from '@/components/TicketDetail'

function loadTicket(id: string): TicketDetailDto {
  try {
    return getEngine().getTicket(id)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') notFound()
    throw err
  }
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TicketDetail ticket={loadTicket(id)} />
}
```

`apps/web/app/not-found.tsx`:

```tsx
export default function NotFound() {
  return <p className="p-6 text-slate-400 text-sm">Ticket nicht gefunden.</p>
}
```

`apps/web/app/error.tsx`:

```tsx
'use client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-red-600">Etwas ist schiefgelaufen: {error.message}</p>
      <button onClick={reset} className="btn-ghost-xs">
        Erneut versuchen
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Tests laufen lassen – müssen grün sein**

Run: `npm test -w apps/web`
Expected: PASS (actionResult 3, actions 4, route 4, useSSE 5, CreateTicketDialog 3, QuestionPanel 3, TicketLive 7).

- [ ] **Step 6: Build**

Run: `npm run build -w apps/web`
Expected: `✓ Compiled successfully`; Routen `/`, `/tickets/[id]`, `/api/events` als dynamisch (`ƒ`) gelistet; keine Typfehler.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): Ticket-Detail mit Live-Updates, Rückfrage, Start/Stop/Löschen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Abnahme Teil 2 – funktionale Parität

- [ ] **Step 1: Alle Tests**

Run: `npm test`
Expected: alle Workspaces PASS (shared, core, backend, web).

- [ ] **Step 2: Neue App starten**

Run (im Hintergrund): `npm run dev:web`
Expected im Log: `Ready` und `Local: http://localhost:3001`; beim ersten Start `[startup] seeded 3 default tickets`; die Datei `apps/web/data/refinement.db` existiert.

- [ ] **Step 3: Server-Smoke-Test mit curl**

```bash
curl -s http://localhost:3001/ | grep -o 'CC-[123]: [^<]*' | sort -u
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/tickets/T-1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/tickets/T-999
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/events
curl -s -N --max-time 2 "http://localhost:3001/api/events?ticketId=T-1"; echo
```
Expected: die drei Seed-Titel; `200`; `404`; `400`; `: ok` (danach Timeout nach 2 s – der Stream bleibt offen).

- [ ] **Step 4: UI-Parität im Browser prüfen**

`http://localhost:3001` öffnen (oder Screenshot per headless Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1440,900 --virtual-time-budget=8000 --screenshot=<scratchpad>/web.png http://localhost:3001/tickets/T-1`) und mit der alten App vergleichen:

- Sidebar: Repository-Feld, „+ Neues Ticket“, „Reset“, drei Tickets mit Status-Badge; aktives Ticket hervorgehoben.
- Ticket öffnen: URL `/tickets/T-1`, Titel, Status, Modell-Auswahl, Beschreibung, Buttons „Refine“ (deaktiviert ohne Repo), „Löschen“.
- Repository setzen → „Refine“ wird aktiv; Neu laden behält die URL.
- Neues Ticket anlegen → Weiterleitung auf das neue Ticket; erscheint in der Sidebar.
- Löschen → zurück auf `/`; Reset → drei Seeds.

Einen echten Agent-Lauf (Refine mit Live-Fortschritt, Rückfrage, Ergebnis, Stop) **nur nach Rückfrage beim Nutzer** – verbraucht Tokens über dessen Claude-Zugang.

- [ ] **Step 5: Dev-Server stoppen und Stand festhalten**

```bash
git status --short
```
Expected: sauber (die Datenbank unter `apps/web/data/` ist ignoriert). Falls Next `tsconfig.json` oder `next-env.d.ts`-Bezüge angepasst hat:

```bash
git add apps/web/tsconfig.json && git commit -m "chore(web): von Next ergänzte tsconfig-Einstellungen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Teil 2 ist abgeschlossen, wenn Step 1–4 erfüllt sind. Weiter mit `2026-10-28-nextjs-hexagonal-3-cleanup.md`.
