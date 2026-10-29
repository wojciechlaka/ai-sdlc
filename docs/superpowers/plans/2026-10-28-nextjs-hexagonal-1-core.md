# Next.js + Hexagonal – Teil 1: Kern herauslösen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Fachlogik aus `apps/backend` wird nach Ports & Adapters in ein neues Paket `packages/core` verschoben; `packages/shared` wird zum API-Vertrag; `apps/backend` wird ein dünner Hono-Adapter. Das Verhalten der App bleibt identisch (das Vite-Frontend läuft unverändert weiter).

**Architecture:** `packages/core` enthält `domain/` (reine Regeln), `ports/` (Interfaces), `application/` (Use Cases, bekommen Ports injiziert), `adapters/` (SQLite/Drizzle, Git, Claude CLI, Node-EventEmitter) und `compose.ts` (verdrahtet echte Adapter). Use Cases validieren Eingaben mit Zod-Schemas aus `packages/shared`. Spec: `docs/superpowers/specs/2026-10-28-nextjs-hexagonal-design.md`.

**Tech Stack:** TypeScript 6, Node 20+, npm workspaces, Zod 4, Drizzle ORM + better-sqlite3, Vitest 4, Hono (nur noch als Übergangs-Adapter), ESLint 10 (nur für die Abhängigkeitsregel).

**Branch:** `feature/nextjs-hexagonal` (existiert bereits). Alle Befehle laufen im Repo-Root `ai-sdlc/`, sofern nicht anders angegeben.

---

## Dateistruktur nach Teil 1

```
packages/shared/src/
├─ index.ts                 (geändert: exportiert api + events)
├─ refinementSchema.ts      (unverändert)
├─ api.ts                   (neu)  Status-Enums, DTO-Schemas, Input-Schemas
├─ api.test.ts              (neu)
├─ events.ts                (neu)  RefinementEventSchema
└─ events.test.ts           (neu)

packages/core/
├─ package.json, tsconfig.json, vitest.config.ts, drizzle.config.ts, eslint.config.mjs   (neu)
├─ drizzle/                 (verschoben aus apps/backend/drizzle)
├─ skills/                  (verschoben aus apps/backend/skills)
└─ src/
   ├─ index.ts              öffentliche API des Pakets
   ├─ compose.ts            createRefinementEngine(config), resolveCorePaths(coreDir)
   ├─ domain/
   │  ├─ types.ts           Ticket, AgentRun, AgentRunInput, QAPair
   │  ├─ ticketId.ts        formatTicketId, parseTicketId  (+ .test.ts)
   │  ├─ errors.ts          NotFoundError, ConflictError, ValidationError, errorCode  (+ .test.ts)
   │  ├─ rules.ts           canStartRefinement, isAnswerInProgress, canDelete, statusAfterRun, planAnswerRun  (+ .test.ts)
   │  └─ seeds.ts           SEED_TICKETS
   ├─ ports/
   │  ├─ index.ts           Barrel
   │  ├─ ticketRepository.ts, agentRunRepository.ts, auditLog.ts
   │  ├─ agentRunner.ts     AgentRunner + AgentRunTerminatedError/AgentRunTimeoutError
   │  ├─ repoProvider.ts
   │  └─ eventPublisher.ts
   ├─ application/
   │  ├─ deps.ts            UseCaseDeps
   │  ├─ dto.ts             toTicketDto, toAgentRunDto
   │  ├─ validation.ts      parseInput
   │  ├─ requireTicket.ts
   │  ├─ reporter.ts        log/progress/setStatus/question pro Ticket
   │  ├─ sleep.ts
   │  ├─ executeRun.ts
   │  ├─ refinementJobs.ts  runInitialRefinement, runAnswer (Hintergrund)
   │  ├─ queries.ts         listTickets, getTicket, getRun
   │  ├─ commands.ts        createTicket, startRefinement, answerQuestion, stopRefinement, deleteTicket, resetSystem
   │  ├─ startup.ts         seedIfEmpty + recoverStuckRuns
   │  ├─ createUseCases.ts  UseCases-Interface + Factory
   │  └─ *.test.ts
   ├─ adapters/
   │  ├─ nodeEvents/nodeEventPublisher.ts (+ .test.ts)
   │  ├─ sqlite/schema.ts, database.ts, ticketRepository.ts, agentRunRepository.ts, auditLog.ts (+ tests)
   │  ├─ git/repoCache.ts   (verschoben aus apps/backend/src/repoCache.ts, + Factory) (+ tests)
   │  └─ claudeCli/index.ts, prompt.ts, errors.ts, types.ts (verschoben aus apps/backend/src/agentCli) (+ tests)
   └─ testing/
      ├─ fakes.ts           In-Memory-Repos, FakeAgentRunner, FakeRepoProvider, createTestContext
      └─ testDb.ts          SQLite-In-Memory-DB mit Migrationen

apps/backend/src/
├─ index.ts      (neu geschrieben)  Engine erzeugen, startup, Hono starten
├─ engine.ts     (neu)              createRefinementEngine mit Pfaden
├─ restApi.ts    (neu geschrieben)  Routen → Use Cases, Fehler → HTTP-Status
└─ sseLayer.ts   (neu geschrieben)  /events → subscribeToTicket
(gelöscht: db/, agentCli/, events.ts, refinementOrchestrator.ts, repoCache.ts, tests/refinementOrchestrator.test.ts,
 tests/repoCache*.test.ts, tests/setup.ts)
```

---

### Task 1: API-Vertrag in `packages/shared`

**Files:**
- Create: `packages/shared/src/api.ts`
- Create: `packages/shared/src/api.test.ts`
- Create: `packages/shared/src/events.ts`
- Create: `packages/shared/src/events.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Failing tests schreiben**

`packages/shared/src/api.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  TicketSchema,
  TicketDetailSchema,
  CreateTicketInput,
  StartRefinementInput,
  AnswerInput,
} from './api'

const NOW = new Date('2026-10-28T10:00:00Z')

const TICKET = {
  id: 'T-1',
  title: 'CC-2: Timer',
  description: 'Desc',
  status: 'backlog' as const,
  iteration: 0,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('TicketSchema', () => {
  it('accepts a ticket with a T-{n} id', () => {
    expect(TicketSchema.parse(TICKET)).toEqual(TICKET)
  })

  it('rejects numeric ids', () => {
    expect(TicketSchema.safeParse({ ...TICKET, id: 1 }).success).toBe(false)
  })

  it('rejects unknown status values', () => {
    expect(TicketSchema.safeParse({ ...TICKET, status: 'done' }).success).toBe(false)
  })
})

describe('TicketDetailSchema', () => {
  it('accepts a ticket without runs', () => {
    expect(TicketDetailSchema.parse({ ...TICKET, latestRun: null }).latestRun).toBeNull()
  })

  it('accepts a ticket with a running run', () => {
    const run = {
      id: 'abc', ticketId: 'T-1', iteration: 1, trigger: 'initial', status: 'running', model: 'm',
      output: null, costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null,
      outputTokens: null, startedAt: NOW, finishedAt: null,
    }
    expect(TicketDetailSchema.parse({ ...TICKET, latestRun: run }).latestRun?.id).toBe('abc')
  })
})

describe('CreateTicketInput', () => {
  it('requires a non-blank title and description', () => {
    expect(CreateTicketInput.safeParse({ title: '  ', description: 'x' }).success).toBe(false)
    expect(CreateTicketInput.safeParse({ title: 'x', description: '' }).success).toBe(false)
    expect(CreateTicketInput.parse({ title: 'x', description: 'y' })).toEqual({ title: 'x', description: 'y' })
  })
})

describe('StartRefinementInput', () => {
  it('defaults acceptanceCriteria to an empty string', () => {
    expect(StartRefinementInput.parse({ repo: 'git@github.com:a/b.git', model: 'm' })).toEqual({
      repo: 'git@github.com:a/b.git', model: 'm', acceptanceCriteria: '',
    })
  })

  it('requires repo and model', () => {
    expect(StartRefinementInput.safeParse({ repo: '', model: 'm' }).success).toBe(false)
    expect(StartRefinementInput.safeParse({ repo: 'r' }).success).toBe(false)
  })
})

describe('AnswerInput', () => {
  it('rejects blank answers', () => {
    expect(AnswerInput.safeParse({ answer: '   ' }).success).toBe(false)
    expect(AnswerInput.parse({ answer: 'Postgres' })).toEqual({ answer: 'Postgres' })
  })
})
```

`packages/shared/src/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RefinementEventSchema } from './events'

describe('RefinementEventSchema', () => {
  it('accepts the three event types', () => {
    expect(RefinementEventSchema.parse({ type: 'progress', ticketId: 'T-1', message: 'm' }).type).toBe('progress')
    expect(RefinementEventSchema.parse({ type: 'question', ticketId: 'T-1', question: 'q' }).type).toBe('question')
    expect(RefinementEventSchema.parse({ type: 'status', ticketId: 'T-1', status: 'review' }).type).toBe('status')
  })

  it('rejects unknown types and invalid status values', () => {
    expect(RefinementEventSchema.safeParse({ type: 'other', ticketId: 'T-1' }).success).toBe(false)
    expect(RefinementEventSchema.safeParse({ type: 'status', ticketId: 'T-1', status: 'done' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w packages/shared`
Expected: FAIL – `Failed to resolve import "./api"` bzw. `"./events"`.

- [ ] **Step 3: Implementierung**

`packages/shared/src/api.ts`:

```ts
import { z } from 'zod'
import { AgentOutputSchema } from './refinementSchema'

const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)

export const TicketStatusSchema = z.enum(['backlog', 'refining', 'review', 'ready', 'failed'])
export type TicketStatus = z.infer<typeof TicketStatusSchema>

export const RunTriggerSchema = z.enum(['initial', 'answer', 'rework'])
export type RunTrigger = z.infer<typeof RunTriggerSchema>

export const RunStatusSchema = z.enum(['running', 'succeeded', 'failed', 'timeout'])
export type RunStatus = z.infer<typeof RunStatusSchema>

export const TicketSchema = z.object({
  id: z.string().regex(/^T-\d+$/),
  title: z.string(),
  description: z.string(),
  status: TicketStatusSchema,
  iteration: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type TicketDto = z.infer<typeof TicketSchema>

export const AgentRunSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  iteration: z.number().int(),
  trigger: RunTriggerSchema,
  status: RunStatusSchema,
  model: z.string(),
  output: AgentOutputSchema.nullable(),
  costUsd: z.number().nullable(),
  inputTokens: z.number().int().nullable(),
  cacheCreationTokens: z.number().int().nullable(),
  cacheReadTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
})
export type AgentRunDto = z.infer<typeof AgentRunSchema>

export const TicketDetailSchema = TicketSchema.extend({
  latestRun: AgentRunSchema.nullable(),
})
export type TicketDetailDto = z.infer<typeof TicketDetailSchema>

export const CreateTicketInput = z.object({
  title: notBlank('Titel ist erforderlich'),
  description: notBlank('Beschreibung ist erforderlich'),
})
export type CreateTicketInput = z.infer<typeof CreateTicketInput>

/** `repo` is not checked as URL on purpose: SSH remotes and local paths are valid git sources. */
export const StartRefinementInput = z.object({
  repo: notBlank('Repository ist erforderlich'),
  model: notBlank('Modell ist erforderlich'),
  acceptanceCriteria: z.string().default(''),
})
export type StartRefinementInput = z.infer<typeof StartRefinementInput>

export const AnswerInput = z.object({
  answer: notBlank('Antwort ist erforderlich'),
})
export type AnswerInput = z.infer<typeof AnswerInput>
```

`packages/shared/src/events.ts`:

```ts
import { z } from 'zod'
import { TicketStatusSchema } from './api'

export const RefinementEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), ticketId: z.string(), message: z.string() }),
  z.object({ type: z.literal('question'), ticketId: z.string(), question: z.string() }),
  z.object({ type: z.literal('status'), ticketId: z.string(), status: TicketStatusSchema }),
])
export type RefinementEvent = z.infer<typeof RefinementEventSchema>
```

`packages/shared/src/index.ts` (komplett ersetzen):

```ts
export { RefinementOutputSchema, AgentOutputSchema } from './refinementSchema'
export type { RefinementOutput, AgentOutput } from './refinementSchema'
export {
  TicketStatusSchema,
  RunTriggerSchema,
  RunStatusSchema,
  TicketSchema,
  AgentRunSchema,
  TicketDetailSchema,
  CreateTicketInput,
  StartRefinementInput,
  AnswerInput,
} from './api'
export type { TicketStatus, RunTrigger, RunStatus, TicketDto, AgentRunDto, TicketDetailDto } from './api'
export { RefinementEventSchema } from './events'
export type { RefinementEvent } from './events'
```

Hinweis: `CreateTicketInput`, `StartRefinementInput` und `AnswerInput` sind gleichzeitig Wert (Schema) und Typ; der Wert-Export in der ersten Liste exportiert beide.

- [ ] **Step 4: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/shared`
Expected: PASS (alle Tests in `refinementSchema.test.ts`, `api.test.ts`, `events.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): API-Vertrag (DTOs, Inputs) und RefinementEvent-Schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Paket `packages/core` anlegen, Migrationen und Skill verschieben

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/drizzle.config.ts`
- Move: `apps/backend/drizzle/` → `packages/core/drizzle/`
- Move: `apps/backend/skills/` → `packages/core/skills/`
- Create: `packages/core/src/index.ts` (vorläufig)

- [ ] **Step 1: Paketdateien anlegen**

`packages/core/package.json`:

```json
{
  "name": "@refinement/core",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^2.1.175",
    "@refinement/shared": "*",
    "better-sqlite3": "^12.11.1",
    "drizzle-orm": "^0.45.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.9.3",
    "drizzle-kit": "^0.31.10",
    "eslint": "^10.3.0",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.59.2",
    "vitest": "^4.1.8"
  }
}
```

`@anthropic-ai/claude-code` liefert das `claude`-Binary, das npm-Skripte über `node_modules/.bin` im `PATH` finden (bisher Abhängigkeit von `apps/backend`).

`packages/core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['node_modules/**'],
  },
})
```

`packages/core/drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/adapters/sqlite/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: 'data/drizzle-kit.db' },
} satisfies Config
```

`packages/core/src/index.ts` (vorläufig, wird in Task 12 vervollständigt):

```ts
export {}
```

- [ ] **Step 2: Migrationen und Skill verschieben**

```bash
mkdir -p packages/core
git mv apps/backend/drizzle packages/core/drizzle
git mv apps/backend/skills packages/core/skills
```

`apps/backend/src/db/client.ts` und `apps/backend/src/agentCli/index.ts` zeigen bis Task 13 noch auf die alten Pfade. Deshalb dürfen zwischen Task 2 und Task 13 die Backend-Tests rot sein; die Kern-Tests sind maßgeblich. Die alte App wird erst in Task 14 wieder gestartet.

- [ ] **Step 3: Workspace verlinken**

Run: `npm install`
Expected: läuft ohne Fehler durch; `ls node_modules/@refinement` zeigt `core` und `shared`.

- [ ] **Step 4: Commit**

```bash
git add packages/core package-lock.json apps/backend
git commit -m "chore(core): Paket @refinement/core anlegen, Migrationen und Skill verschieben

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Domäne – Typen, Ticket-ID, Fehler, Seeds

**Files:**
- Create: `packages/core/src/domain/types.ts`
- Create: `packages/core/src/domain/ticketId.ts`, `packages/core/src/domain/ticketId.test.ts`
- Create: `packages/core/src/domain/errors.ts`, `packages/core/src/domain/errors.test.ts`
- Create: `packages/core/src/domain/seeds.ts`

- [ ] **Step 1: Failing tests schreiben**

`packages/core/src/domain/ticketId.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatTicketId, parseTicketId } from './ticketId'

describe('formatTicketId / parseTicketId', () => {
  it('formats integer as T-{n}', () => {
    expect(formatTicketId(1)).toBe('T-1')
    expect(formatTicketId(42)).toBe('T-42')
  })

  it('parses T-{n} back to integer', () => {
    expect(parseTicketId('T-1')).toBe(1)
    expect(parseTicketId('T-42')).toBe(42)
  })

  it('throws for invalid format', () => {
    expect(() => parseTicketId('invalid')).toThrow('Invalid ticket ID')
  })
})
```

`packages/core/src/domain/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NotFoundError, ConflictError, ValidationError, errorCode } from './errors'

describe('domain errors', () => {
  it('carry a stable code and their message', () => {
    expect(new NotFoundError('x').code).toBe('NOT_FOUND')
    expect(new ConflictError('x').code).toBe('CONFLICT')
    expect(new ValidationError('bad').message).toBe('bad')
  })
})

describe('errorCode', () => {
  it('returns the code of domain errors', () => {
    expect(errorCode(new NotFoundError('x'))).toBe('NOT_FOUND')
    expect(errorCode(new ConflictError('x'))).toBe('CONFLICT')
    expect(errorCode(new ValidationError('x'))).toBe('VALIDATION')
  })

  it('recognises errors from another module copy by their code field', () => {
    const foreign = Object.assign(new Error('copy'), { code: 'CONFLICT' })
    expect(errorCode(foreign)).toBe('CONFLICT')
  })

  it('returns null for everything else', () => {
    expect(errorCode(new Error('x'))).toBeNull()
    expect(errorCode(Object.assign(new Error('fs'), { code: 'ENOENT' }))).toBeNull()
    expect(errorCode(null)).toBeNull()
    expect(errorCode('string')).toBeNull()
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w packages/core`
Expected: FAIL – `Failed to resolve import "./ticketId"` / `"./errors"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/domain/types.ts`:

```ts
import type { AgentOutput, RunStatus, RunTrigger, TicketStatus } from '@refinement/shared'

export type { TicketStatus, RunStatus, RunTrigger }

export interface QAPair {
  question: string
  answer: string
}

/** Snapshot of everything a run was started with; persisted with the run. */
export interface AgentRunInput {
  ticketTitle: string
  ticketDescription: string
  acceptanceCriteria: string
  repo: string
  model: string
  previousRuns?: QAPair[]
  feedback?: string
}

export interface Ticket {
  id: number
  title: string
  description: string
  status: TicketStatus
  iteration: number
  createdAt: Date
  updatedAt: Date
}

export interface AgentRun {
  id: string
  ticketId: number
  iteration: number
  trigger: RunTrigger
  input: AgentRunInput
  output: AgentOutput | null
  status: RunStatus
  model: string
  costUsd: number | null
  inputTokens: number | null
  cacheCreationTokens: number | null
  cacheReadTokens: number | null
  outputTokens: number | null
  startedAt: Date
  finishedAt: Date | null
}
```

`packages/core/src/domain/ticketId.ts`:

```ts
/**
 * Converts a numeric id to the public `T-{id}` format used in the API and UI.
 * @param id - Numeric ticket ID.
 */
export function formatTicketId(id: number): string {
  return `T-${id}`
}

/**
 * Parses a `T-{id}` string back to a numeric id. Throws on invalid format.
 * @param formatted - Public ticket ID string, e.g. `T-42`.
 */
export function parseTicketId(formatted: string): number {
  const match = /^T-(\d+)$/.exec(formatted)
  if (!match) throw new Error(`Invalid ticket ID: ${formatted}`)
  return parseInt(match[1], 10)
}
```

`packages/core/src/domain/errors.ts`:

```ts
export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION'

/** The requested ticket or run does not exist. */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** The action is not allowed in the ticket's current state. */
export class ConflictError extends Error {
  readonly code = 'CONFLICT' as const
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/** The input did not match the expected schema. */
export class ValidationError extends Error {
  readonly code = 'VALIDATION' as const
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const DOMAIN_CODES: readonly DomainErrorCode[] = ['NOT_FOUND', 'CONFLICT', 'VALIDATION']

/**
 * Returns the domain error code, or null for any other error.
 * Checks the `code` field instead of `instanceof` because bundlers (Next.js) may load
 * this module more than once, which breaks class identity.
 * @param err - Any thrown value.
 */
export function errorCode(err: unknown): DomainErrorCode | null {
  if (typeof err !== 'object' || err === null) return null
  const code = (err as { code?: unknown }).code
  return DOMAIN_CODES.includes(code as DomainErrorCode) ? (code as DomainErrorCode) : null
}
```

`packages/core/src/domain/seeds.ts`:

```ts
/** The three example tickets restored by "Reset" and inserted into an empty database. */
export const SEED_TICKETS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: 'CC-1: Eigene Fragen hinzufügen',
    description: 'Aktuell gibt es nur die fest eingebauten Fragen. Mehrere Teams haben gefragt, ob sie eigene Fragen verwenden können, z. B. firmenspezifische oder zum aktuellen Teamevent. Der Host sollte beim Erstellen des Spiels irgendwie eigene Fragen eingeben können.',
  },
  {
    title: 'CC-2: Timer für die Antwortphase',
    description: 'Manche Runden ziehen sich ewig, weil einzelne Spieler nicht antworten. Es wäre gut, wenn es ein Zeitlimit gäbe, damit das Spiel weitergeht. Der Host sollte das vielleicht einstellen können.',
  },
  {
    title: 'CC-3: Spieler fliegen bei Verbindungsabbruch raus',
    description: 'Wenn jemand kurz die Verbindung verliert (Laptop zugeklappt, WLAN-Wechsel), ist er aus dem Spiel raus und die Runde hängt. Spieler sollten wieder reinkommen können, ohne dass das Spiel kaputtgeht.',
  },
]
```

- [ ] **Step 4: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/core`
Expected: PASS (`ticketId.test.ts`, `errors.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain
git commit -m "feat(core): Domänentypen, Ticket-ID, Fachfehler mit errorCode, Seeds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Domäne – Regeln

**Files:**
- Create: `packages/core/src/domain/rules.ts`
- Create: `packages/core/src/domain/rules.test.ts`

Die Regeln bilden exakt das bisherige Verhalten aus `restApi.ts` und `refinementOrchestrator.ts` ab (z. B. ist `failed` bewusst nicht erneut verfeinerbar – Spec Abschnitt 11).

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/domain/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AgentRun, Ticket } from './types'
import { canStartRefinement, isAnswerInProgress, canDelete, statusAfterRun, planAnswerRun } from './rules'

const NOW = new Date()

function ticket(status: Ticket['status']): Ticket {
  return { id: 1, title: 'T', description: 'D', status, iteration: 0, createdAt: NOW, updatedAt: NOW }
}

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'r', ticketId: 1, iteration: 1, trigger: 'initial',
    input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'repo', model: 'm' },
    output: null, status: 'succeeded', model: 'm', costUsd: null, inputTokens: null,
    cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null, startedAt: NOW, finishedAt: NOW,
    ...overrides,
  }
}

const REFINEMENT = {
  type: 'refinement' as const,
  result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

describe('canStartRefinement', () => {
  it('allows backlog and review only', () => {
    expect(canStartRefinement(ticket('backlog'))).toBe(true)
    expect(canStartRefinement(ticket('review'))).toBe(true)
    expect(canStartRefinement(ticket('refining'))).toBe(false)
    expect(canStartRefinement(ticket('failed'))).toBe(false)
    expect(canStartRefinement(ticket('ready'))).toBe(false)
  })
})

describe('isAnswerInProgress', () => {
  it('is true only for a running answer run', () => {
    expect(isAnswerInProgress(null)).toBe(false)
    expect(isAnswerInProgress(run({ trigger: 'answer', status: 'running' }))).toBe(true)
    expect(isAnswerInProgress(run({ trigger: 'answer', status: 'succeeded' }))).toBe(false)
    expect(isAnswerInProgress(run({ trigger: 'initial', status: 'running' }))).toBe(false)
  })
})

describe('canDelete', () => {
  it('forbids deleting while refining', () => {
    expect(canDelete(ticket('refining'))).toBe(false)
    expect(canDelete(ticket('backlog'))).toBe(true)
    expect(canDelete(ticket('failed'))).toBe(true)
  })
})

describe('statusAfterRun', () => {
  it('moves to review after a refinement and stays refining after a question', () => {
    expect(statusAfterRun(REFINEMENT)).toBe('review')
    expect(statusAfterRun({ type: 'question', question: 'q' })).toBe('refining')
  })
})

describe('planAnswerRun', () => {
  it('returns null when no run asked a question', () => {
    expect(planAnswerRun([], 'a')).toBeNull()
    expect(planAnswerRun([run({ output: REFINEMENT })], 'a')).toBeNull()
  })

  it('starts the Q&A history with the latest question', () => {
    const questionRun = run({ id: 'q1', output: { type: 'question', question: 'Welche DB?' } })
    const plan = planAnswerRun([questionRun], 'Postgres')
    expect(plan?.questionRun.id).toBe('q1')
    expect(plan?.previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
  })

  it('appends to the history of the latest answer run', () => {
    const runs = [
      run({ id: 'r1', iteration: 1, output: { type: 'question', question: 'Q1' } }),
      run({
        id: 'r2', iteration: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
        input: {
          ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'repo', model: 'm',
          previousRuns: [{ question: 'Q1', answer: 'A1' }],
        },
      }),
    ]
    const plan = planAnswerRun(runs, 'A2')
    expect(plan?.questionRun.id).toBe('r2')
    expect(plan?.previousRuns).toEqual([
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ])
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/domain/rules.test.ts`
Expected: FAIL – `Failed to resolve import "./rules"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/domain/rules.ts`:

```ts
import type { AgentOutput } from '@refinement/shared'
import type { AgentRun, QAPair, Ticket, TicketStatus } from './types'

/** Refinement can start from `backlog` or `review` (re-run). */
export function canStartRefinement(ticket: Ticket): boolean {
  return ticket.status === 'backlog' || ticket.status === 'review'
}

/** True while an answer-triggered run is still executing — a second answer must be rejected. */
export function isAnswerInProgress(latestRun: AgentRun | null): boolean {
  return latestRun?.trigger === 'answer' && latestRun.status === 'running'
}

/** A ticket cannot be deleted while its agent is running. */
export function canDelete(ticket: Ticket): boolean {
  return ticket.status !== 'refining'
}

/** A finished refinement goes to review; a question keeps the ticket refining until answered. */
export function statusAfterRun(output: AgentOutput): TicketStatus {
  return output.type === 'refinement' ? 'review' : 'refining'
}

/**
 * Finds the latest open question and builds the Q&A history for the next run.
 * The history continues from the latest answer-triggered run, if any.
 * Returns null when no run has asked a question.
 * @param runs   - All runs of the ticket in iteration order.
 * @param answer - The human's answer to the latest question.
 */
export function planAnswerRun(
  runs: AgentRun[],
  answer: string,
): { questionRun: AgentRun; previousRuns: QAPair[] } | null {
  let questionRun: AgentRun | undefined
  let answerRun: AgentRun | undefined
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!
    if (!questionRun && run.output?.type === 'question') questionRun = run
    if (!answerRun && run.trigger === 'answer') answerRun = run
    if (questionRun && answerRun) break
  }
  const output = questionRun?.output
  if (!questionRun || output?.type !== 'question') return null

  const existing = answerRun?.input.previousRuns ?? []
  return { questionRun, previousRuns: [...existing, { question: output.question, answer }] }
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w packages/core -- src/domain/rules.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain
git commit -m "feat(core): Fachregeln für Refine, Antwort, Löschen und Q&A-Verlauf

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ports

**Files:**
- Create: `packages/core/src/ports/ticketRepository.ts`
- Create: `packages/core/src/ports/agentRunRepository.ts`
- Create: `packages/core/src/ports/auditLog.ts`
- Create: `packages/core/src/ports/agentRunner.ts`
- Create: `packages/core/src/ports/repoProvider.ts`
- Create: `packages/core/src/ports/eventPublisher.ts`
- Create: `packages/core/src/ports/index.ts`

Reine Interfaces (plus die beiden Fehlerklassen, die zum Vertrag des `AgentRunner` gehören). Kein eigener Test; der Compiler prüft sie über die Adapter- und Use-Case-Tests.

- [ ] **Step 1: Dateien anlegen**

`packages/core/src/ports/ticketRepository.ts`:

```ts
import type { Ticket, TicketStatus } from '../domain/types'

export interface TicketRepository {
  list(): Ticket[]
  findById(id: number): Ticket | null
  count(): number
  create(input: { title: string; description: string }): Ticket
  /** Throws if the ticket does not exist. */
  updateStatus(id: number, status: TicketStatus): void
  /** Throws if the ticket does not exist. Runs and audit events are removed with it. */
  delete(id: number): void
  /** Deletes all tickets (with their runs and events) and inserts the given ones. */
  replaceAll(tickets: ReadonlyArray<{ title: string; description: string }>): Ticket[]
}
```

`packages/core/src/ports/agentRunRepository.ts`:

```ts
import type { AgentOutput } from '@refinement/shared'
import type { AgentRun, AgentRunInput, RunTrigger } from '../domain/types'

export interface RunCompletion {
  output: AgentOutput
  costUsd: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
}

export interface AgentRunRepository {
  /** Creates a `running` run and atomically increments the ticket's iteration counter. */
  create(input: { ticketId: number; trigger: RunTrigger; input: AgentRunInput; model: string }): AgentRun
  findById(id: string): AgentRun | null
  /** Marks the run `succeeded` — for both `question` and `refinement` outputs. */
  complete(id: string, result: RunCompletion): void
  fail(id: string, status: 'failed' | 'timeout'): void
  /** All runs of a ticket in iteration order. */
  listForTicket(ticketId: number): AgentRun[]
  latestForTicket(ticketId: number): AgentRun | null
  /** Runs still `running` — survivors of an unclean shutdown. */
  findStuck(): AgentRun[]
}
```

`packages/core/src/ports/auditLog.ts`:

```ts
export type AuditActor = 'human' | 'agent' | 'system'

export interface AuditLog {
  append(event: { ticketId: number; actor: AuditActor; type: string; payload?: unknown }): void
}
```

`packages/core/src/ports/agentRunner.ts`:

```ts
import type { AgentOutput } from '@refinement/shared'
import type { QAPair } from '../domain/types'

export interface AgentRunnerInput {
  /** Public ticket id (`T-{n}`); also the key for `stop`. */
  ticketId: string
  title: string
  description: string
  acceptanceCriteria: string
  repoPath: string
  model: string
  codebaseSummary?: string
  feedback?: string
  previousRuns?: QAPair[]
}

export interface AgentRunMeta {
  model: string
  durationSeconds: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export interface AgentRunResult {
  output: AgentOutput
  meta: AgentRunMeta
}

export interface AgentRunner {
  /**
   * Runs the refinement agent and returns its validated output.
   * @throws {AgentRunTerminatedError} when stopped via `stop`.
   * @throws {AgentRunTimeoutError} when the run exceeds its time limit.
   */
  run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult>
  /** Stops the running agent for the ticket. Returns false if none is running. */
  stop(ticketId: string): boolean
}

/** The run was stopped on user request. */
export class AgentRunTerminatedError extends Error {
  constructor() {
    super('Refinement was terminated by user')
    this.name = 'AgentRunTerminatedError'
  }
}

/** The agent did not finish within its time limit. */
export class AgentRunTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude did not respond within ${timeoutMs}ms`)
    this.name = 'AgentRunTimeoutError'
  }
}
```

`packages/core/src/ports/repoProvider.ts`:

```ts
export interface RepoProvider {
  /** Clones or updates the repository and returns the local checkout path. */
  ensureRepo(url: string): Promise<string>
  /** Returns a cached or freshly generated codebase summary, or null if unavailable. Never throws. */
  ensureSummary(repoDir: string, model: string, onProgress: (message: string) => void): Promise<string | null>
}
```

`packages/core/src/ports/eventPublisher.ts`:

```ts
import type { RefinementEvent } from '@refinement/shared'

export interface EventPublisher {
  publish(event: RefinementEvent): void
  /** Subscribes to all events of one ticket. Returns the unsubscribe function. */
  subscribe(ticketId: string, handler: (event: RefinementEvent) => void): () => void
}
```

`packages/core/src/ports/index.ts`:

```ts
export type { TicketRepository } from './ticketRepository'
export type { AgentRunRepository, RunCompletion } from './agentRunRepository'
export type { AuditLog, AuditActor } from './auditLog'
export type { AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult } from './agentRunner'
export { AgentRunTerminatedError, AgentRunTimeoutError } from './agentRunner'
export type { RepoProvider } from './repoProvider'
export type { EventPublisher } from './eventPublisher'
```

- [ ] **Step 2: Typprüfung**

Run: `npm run build -w packages/core`
Expected: keine Ausgabe, Exit-Code 0.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ports
git commit -m "feat(core): Ports für Repositories, Audit, Agent, Repo und Events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Adapter `nodeEvents` – typisierter Event-Bus

**Files:**
- Create: `packages/core/src/adapters/nodeEvents/nodeEventPublisher.ts`
- Create: `packages/core/src/adapters/nodeEvents/nodeEventPublisher.test.ts`

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/adapters/nodeEvents/nodeEventPublisher.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createNodeEventPublisher } from './nodeEventPublisher'

describe('createNodeEventPublisher', () => {
  it('delivers events only to subscribers of the same ticket', () => {
    const bus = createNodeEventPublisher()
    const t1 = vi.fn()
    const t2 = vi.fn()
    bus.subscribe('T-1', t1)
    bus.subscribe('T-2', t2)

    bus.publish({ type: 'progress', ticketId: 'T-1', message: 'hi' })

    expect(t1).toHaveBeenCalledWith({ type: 'progress', ticketId: 'T-1', message: 'hi' })
    expect(t2).not.toHaveBeenCalled()
  })

  it('supports several subscribers per ticket', () => {
    const bus = createNodeEventPublisher()
    const a = vi.fn()
    const b = vi.fn()
    bus.subscribe('T-1', a)
    bus.subscribe('T-1', b)

    bus.publish({ type: 'status', ticketId: 'T-1', status: 'review' })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createNodeEventPublisher()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe('T-1', handler)

    unsubscribe()
    bus.publish({ type: 'question', ticketId: 'T-1', question: 'q' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not warn about many listeners', () => {
    const bus = createNodeEventPublisher()
    const warn = vi.spyOn(process, 'emitWarning')
    for (let i = 0; i < 20; i++) bus.subscribe('T-1', () => {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/adapters/nodeEvents`
Expected: FAIL – `Failed to resolve import "./nodeEventPublisher"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/adapters/nodeEvents/nodeEventPublisher.ts`:

```ts
import { EventEmitter } from 'events'
import type { RefinementEvent } from '@refinement/shared'
import type { EventPublisher } from '../../ports'

const channel = (ticketId: string) => `ticket:${ticketId}`

/**
 * In-process event bus on top of Node's EventEmitter, one channel per ticket.
 * Only reaches subscribers in the same process (see spec section 11 for Phase 3).
 */
export function createNodeEventPublisher(): EventPublisher {
  const emitter = new EventEmitter()
  // Every open browser tab subscribes; the default limit of 10 would trigger warnings.
  emitter.setMaxListeners(0)

  return {
    publish(event: RefinementEvent) {
      emitter.emit(channel(event.ticketId), event)
    },
    subscribe(ticketId, handler) {
      const name = channel(ticketId)
      emitter.on(name, handler)
      return () => {
        emitter.off(name, handler)
      }
    },
  }
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w packages/core -- src/adapters/nodeEvents`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/nodeEvents
git commit -m "feat(core): typisierter Event-Bus als Node-EventEmitter-Adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Adapter `sqlite` – Schema, Datenbank, Repositories

**Files:**
- Move: `apps/backend/src/db/schema.ts` → `packages/core/src/adapters/sqlite/schema.ts` (dann ersetzen)
- Create: `packages/core/src/adapters/sqlite/database.ts`
- Create: `packages/core/src/adapters/sqlite/ticketRepository.ts`
- Create: `packages/core/src/adapters/sqlite/agentRunRepository.ts`
- Create: `packages/core/src/adapters/sqlite/auditLog.ts`
- Create: `packages/core/src/testing/testDb.ts`
- Create: `packages/core/src/adapters/sqlite/ticketRepository.test.ts`
- Create: `packages/core/src/adapters/sqlite/agentRunRepository.test.ts`
- Create: `packages/core/src/adapters/sqlite/auditLog.test.ts`

- [ ] **Step 1: Schema verschieben und Imports umstellen**

```bash
mkdir -p packages/core/src/adapters/sqlite
git mv apps/backend/src/db/schema.ts packages/core/src/adapters/sqlite/schema.ts
```

`packages/core/src/adapters/sqlite/schema.ts` (komplett ersetzen – Tabellen identisch, nur die Typen kommen jetzt aus der Domäne):

```ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { randomBytes } from 'crypto'
import type { AgentOutput } from '@refinement/shared'
import type { AgentRunInput } from '../../domain/types'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())

export const tickets = sqliteTable('tickets', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description').notNull().default(''),
  status:      text('status', { enum: ['backlog', 'refining', 'review', 'ready', 'failed'] })
                 .notNull().default('backlog'),
  iteration:   integer('iteration').notNull().default(0),
  createdAt:   createdAt(),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

export const agentRuns = sqliteTable('agent_runs', {
  id:                  text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:            integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  iteration:           integer('iteration').notNull(),
  trigger:             text('trigger', { enum: ['initial', 'answer', 'rework'] }).notNull(),
  input:               text('input', { mode: 'json' }).$type<AgentRunInput>().notNull(),
  output:              text('output', { mode: 'json' }).$type<AgentOutput | null>(),
  status:              text('status', { enum: ['running', 'succeeded', 'failed', 'timeout'] }).notNull(),
  model:               text('model').notNull(),
  costUsd:             real('cost_usd'),
  inputTokens:         integer('input_tokens'),
  cacheCreationTokens: integer('cache_creation_tokens'),
  cacheReadTokens:     integer('cache_read_tokens'),
  outputTokens:        integer('output_tokens'),
  startedAt:           integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  finishedAt:          integer('finished_at', { mode: 'timestamp' }),
})

export const reviewDecisions = sqliteTable('review_decisions', {
  id:         text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:   integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  agentRunId: text('agent_run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  decision:   text('decision', { enum: ['approve', 'request_changes'] }).notNull(),
  feedback:   text('feedback'),
  createdAt:  createdAt(),
})

export const auditEvents = sqliteTable('audit_events', {
  id:        text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex')),
  ticketId:  integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  actor:     text('actor', { enum: ['human', 'agent', 'system'] }).notNull(),
  type:      text('type').notNull(),
  payload:   text('payload', { mode: 'json' }),
  createdAt: createdAt(),
})
```

- [ ] **Step 2: Datenbank-Factory und Test-Helfer anlegen**

`packages/core/src/adapters/sqlite/database.ts`:

```ts
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type SqliteDb = BetterSQLite3Database<typeof schema>

const IN_MEMORY = ':memory:'

/**
 * Opens (or creates) the SQLite database, enables foreign keys and applies all migrations.
 * @param options.path             - File path, or `:memory:` for tests.
 * @param options.migrationsFolder - Absolute path to `packages/core/drizzle`.
 * @throws If a migration fails — the app must not start on a broken schema.
 */
export function createSqliteDatabase(options: { path: string; migrationsFolder: string }): SqliteDb {
  if (options.path !== IN_MEMORY) {
    fs.mkdirSync(path.dirname(options.path), { recursive: true })
  }
  const sqlite = new Database(options.path)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsFolder })
  return db
}
```

`packages/core/src/testing/testDb.ts`:

```ts
import path from 'path'
import { createSqliteDatabase, type SqliteDb } from '../adapters/sqlite/database'

/** Fresh in-memory database with the real migrations applied. */
export function createTestDatabase(): SqliteDb {
  return createSqliteDatabase({
    path: ':memory:',
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
  })
}
```

- [ ] **Step 3: Failing tests schreiben**

`packages/core/src/adapters/sqlite/ticketRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import type { TicketRepository } from '../../ports'

let repo: TicketRepository

beforeEach(() => {
  repo = createSqliteTicketRepository(createTestDatabase())
})

describe('create / findById', () => {
  it('inserts a row with defaults', () => {
    const t = repo.create({ title: 'Test', description: 'Desc' })
    expect(t.title).toBe('Test')
    expect(t.description).toBe('Desc')
    expect(t.status).toBe('backlog')
    expect(t.iteration).toBe(0)
    expect(repo.findById(t.id)?.id).toBe(t.id)
  })

  it('returns null for unknown ids', () => {
    expect(repo.findById(9999)).toBeNull()
  })
})

describe('list / count', () => {
  it('returns all tickets in insertion order', () => {
    repo.create({ title: 'A', description: '' })
    repo.create({ title: 'B', description: '' })
    expect(repo.list().map((t) => t.title)).toEqual(['A', 'B'])
    expect(repo.count()).toBe(2)
  })
})

describe('updateStatus', () => {
  it('changes status', () => {
    const t = repo.create({ title: 'T', description: '' })
    repo.updateStatus(t.id, 'refining')
    expect(repo.findById(t.id)?.status).toBe('refining')
  })

  it('throws for unknown id', () => {
    expect(() => repo.updateStatus(9999, 'review')).toThrow('not found')
  })
})

describe('delete', () => {
  it('removes the row', () => {
    const t = repo.create({ title: 'T', description: '' })
    repo.delete(t.id)
    expect(repo.findById(t.id)).toBeNull()
  })

  it('throws for unknown id', () => {
    expect(() => repo.delete(9999)).toThrow('not found')
  })
})

describe('replaceAll', () => {
  it('replaces all tickets with the given ones', () => {
    repo.create({ title: 'Extra', description: '' })
    const created = repo.replaceAll([
      { title: 'S1', description: 'd1' },
      { title: 'S2', description: 'd2' },
    ])
    expect(created.map((t) => t.title)).toEqual(['S1', 'S2'])
    expect(repo.list().map((t) => t.title)).toEqual(['S1', 'S2'])
    expect(created.every((t) => t.status === 'backlog')).toBe(true)
  })
})
```

`packages/core/src/adapters/sqlite/agentRunRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { AgentOutput } from '@refinement/shared'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAgentRunRepository } from './agentRunRepository'
import type { AgentRunRepository, TicketRepository } from '../../ports'

const INPUT = {
  ticketTitle: 'Test', ticketDescription: 'Desc', acceptanceCriteria: '',
  repo: 'https://github.com/example/repo', model: 'claude-sonnet-4-6',
}

const OUTPUT: AgentOutput = {
  type: 'refinement',
  result: { title: 'Test', userStory: 'Als Nutzer...', acceptanceCriteria: ['AC 1'], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

const NO_TOKENS = { costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 }

let tickets: TicketRepository
let runs: AgentRunRepository

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  runs = createSqliteAgentRunRepository(db)
})

function newTicketId(): number {
  return tickets.create({ title: 'T', description: 'D' }).id
}

describe('create', () => {
  it('creates a running run and increments the ticket iteration', () => {
    const ticketId = newTicketId()
    const run = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    expect(run.status).toBe('running')
    expect(run.iteration).toBe(1)
    expect(run.trigger).toBe('initial')
    expect(tickets.findById(ticketId)?.iteration).toBe(1)
  })

  it('throws for an unknown ticket', () => {
    expect(() => runs.create({ ticketId: 9999, trigger: 'initial', input: INPUT, model: 'm' })).toThrow('not found')
  })
})

describe('findById', () => {
  it('returns the run or null', () => {
    const run = runs.create({ ticketId: newTicketId(), trigger: 'initial', input: INPUT, model: 'm' })
    expect(runs.findById(run.id)?.id).toBe(run.id)
    expect(runs.findById('nope')).toBeNull()
  })
})

describe('complete / fail', () => {
  it('stores output and tokens on complete', () => {
    const run = runs.create({ ticketId: newTicketId(), trigger: 'initial', input: INPUT, model: 'm' })
    runs.complete(run.id, { output: OUTPUT, costUsd: 0.05, inputTokens: 1000, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 200 })
    const updated = runs.findById(run.id)!
    expect(updated.status).toBe('succeeded')
    expect(updated.output?.type).toBe('refinement')
    expect(updated.costUsd).toBe(0.05)
    expect(updated.finishedAt).toBeInstanceOf(Date)
  })

  it('sets failed or timeout on fail', () => {
    const ticketId = newTicketId()
    const a = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    const b = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.fail(a.id, 'failed')
    runs.fail(b.id, 'timeout')
    expect(runs.findById(a.id)?.status).toBe('failed')
    expect(runs.findById(b.id)?.status).toBe('timeout')
  })
})

describe('listForTicket / latestForTicket', () => {
  it('returns runs in iteration order and the latest regardless of status', () => {
    const ticketId = newTicketId()
    const first = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.complete(first.id, { output: { type: 'question', question: 'Q?' }, ...NO_TOKENS })
    const second = runs.create({
      ticketId, trigger: 'answer', model: 'm',
      input: { ...INPUT, previousRuns: [{ question: 'Q?', answer: 'A' }] },
    })

    expect(runs.listForTicket(ticketId).map((r) => r.id)).toEqual([first.id, second.id])
    expect(runs.latestForTicket(ticketId)?.id).toBe(second.id)
    expect(runs.latestForTicket(ticketId)?.status).toBe('running')
  })

  it('returns empty results for a ticket without runs', () => {
    const ticketId = newTicketId()
    expect(runs.listForTicket(ticketId)).toEqual([])
    expect(runs.latestForTicket(ticketId)).toBeNull()
  })
})

describe('findStuck', () => {
  it('returns only running runs', () => {
    const ticketId = newTicketId()
    const running = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    const failed = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    runs.fail(failed.id, 'failed')
    const ids = runs.findStuck().map((r) => r.id)
    expect(ids).toContain(running.id)
    expect(ids).not.toContain(failed.id)
  })
})

describe('cascade', () => {
  it('deletes runs together with their ticket', () => {
    const ticketId = newTicketId()
    const run = runs.create({ ticketId, trigger: 'initial', input: INPUT, model: 'm' })
    tickets.delete(ticketId)
    expect(runs.findById(run.id)).toBeNull()
  })
})
```

`packages/core/src/adapters/sqlite/auditLog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDatabase } from '../../testing/testDb'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAuditLog } from './auditLog'
import { auditEvents } from './schema'

describe('createSqliteAuditLog', () => {
  it('appends events with optional payload', () => {
    const db = createTestDatabase()
    const ticket = createSqliteTicketRepository(db).create({ title: 'T', description: 'D' })
    const audit = createSqliteAuditLog(db)

    audit.append({ ticketId: ticket.id, actor: 'human', type: 'ticket_created' })
    audit.append({ ticketId: ticket.id, actor: 'system', type: 'run_started', payload: { runId: 'r1' } })

    const rows = db.select().from(auditEvents).where(eq(auditEvents.ticketId, ticket.id)).all()
    expect(rows.map((r) => [r.actor, r.type, r.payload])).toEqual([
      ['human', 'ticket_created', null],
      ['system', 'run_started', { runId: 'r1' }],
    ])
  })
})
```

- [ ] **Step 4: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w packages/core -- src/adapters/sqlite`
Expected: FAIL – `Failed to resolve import "./ticketRepository"` (bzw. `agentRunRepository`, `auditLog`).

- [ ] **Step 5: Implementierung**

`packages/core/src/adapters/sqlite/ticketRepository.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { TicketRepository } from '../../ports'
import type { SqliteDb } from './database'
import { tickets } from './schema'

export function createSqliteTicketRepository(db: SqliteDb): TicketRepository {
  const insert = (input: { title: string; description: string }) =>
    db.insert(tickets).values({ title: input.title, description: input.description }).returning().get()

  return {
    list: () => db.select().from(tickets).all(),

    findById: (id) => db.select().from(tickets).where(eq(tickets.id, id)).get() ?? null,

    count: () => db.select().from(tickets).all().length,

    create: insert,

    updateStatus(id, status) {
      const row = db.update(tickets).set({ status, updatedAt: new Date() }).where(eq(tickets.id, id)).returning().get()
      if (!row) throw new Error(`Ticket ${id} not found`)
    },

    delete(id) {
      const row = db.delete(tickets).where(eq(tickets.id, id)).returning().get()
      if (!row) throw new Error(`Ticket ${id} not found`)
    },

    replaceAll(newTickets) {
      db.delete(tickets).run()
      return newTickets.map(insert)
    },
  }
}
```

`packages/core/src/adapters/sqlite/agentRunRepository.ts`:

```ts
import { desc, eq } from 'drizzle-orm'
import type { AgentRunRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns, tickets } from './schema'

export function createSqliteAgentRunRepository(db: SqliteDb): AgentRunRepository {
  return {
    create(input) {
      return db.transaction((tx) => {
        const ticket = tx.select().from(tickets).where(eq(tickets.id, input.ticketId)).get()
        if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`)

        const iteration = ticket.iteration + 1
        tx.update(tickets)
          .set({ iteration, updatedAt: new Date() })
          .where(eq(tickets.id, input.ticketId))
          .run()

        return tx.insert(agentRuns).values({
          ticketId: input.ticketId,
          iteration,
          trigger: input.trigger,
          input: input.input,
          status: 'running',
          model: input.model,
          startedAt: new Date(),
        }).returning().get()
      })
    },

    findById: (id) => db.select().from(agentRuns).where(eq(agentRuns.id, id)).get() ?? null,

    complete(id, result) {
      const row = db.update(agentRuns).set({
        status: 'succeeded',
        output: result.output,
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        cacheCreationTokens: result.cacheCreationTokens,
        cacheReadTokens: result.cacheReadTokens,
        outputTokens: result.outputTokens,
        finishedAt: new Date(),
      }).where(eq(agentRuns.id, id)).returning().get()
      if (!row) throw new Error(`AgentRun ${id} not found`)
    },

    fail(id, status) {
      const row = db.update(agentRuns).set({ status, finishedAt: new Date() }).where(eq(agentRuns.id, id)).returning().get()
      if (!row) throw new Error(`AgentRun ${id} not found`)
    },

    listForTicket: (ticketId) =>
      db.select().from(agentRuns).where(eq(agentRuns.ticketId, ticketId)).orderBy(agentRuns.iteration).all(),

    latestForTicket: (ticketId) =>
      db.select().from(agentRuns)
        .where(eq(agentRuns.ticketId, ticketId))
        .orderBy(desc(agentRuns.iteration))
        .limit(1)
        .get() ?? null,

    findStuck: () => db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).all(),
  }
}
```

`packages/core/src/adapters/sqlite/auditLog.ts`:

```ts
import type { AuditLog } from '../../ports'
import type { SqliteDb } from './database'
import { auditEvents } from './schema'

export function createSqliteAuditLog(db: SqliteDb): AuditLog {
  return {
    append(event) {
      db.insert(auditEvents).values({
        ticketId: event.ticketId,
        actor: event.actor,
        type: event.type,
        payload: event.payload ?? null,
      }).run()
    },
  }
}
```

- [ ] **Step 6: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/core -- src/adapters/sqlite`
Expected: PASS (ticketRepository 8, agentRunRepository 9, auditLog 1).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/adapters/sqlite packages/core/src/testing apps/backend/src/db
git commit -m "feat(core): SQLite-Adapter mit Repositories und Audit-Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Adapter `git` – Repo-Cache verschieben

**Files:**
- Move: `apps/backend/src/repoCache.ts` → `packages/core/src/adapters/git/repoCache.ts`
- Move: `apps/backend/tests/repoCache.test.ts` → `packages/core/src/adapters/git/repoCache.test.ts`
- Move: `apps/backend/tests/repoCache.ensureRepo.test.ts` → `packages/core/src/adapters/git/repoCache.ensureRepo.test.ts`

- [ ] **Step 1: Dateien verschieben**

```bash
mkdir -p packages/core/src/adapters/git
git mv apps/backend/src/repoCache.ts packages/core/src/adapters/git/repoCache.ts
git mv apps/backend/tests/repoCache.test.ts packages/core/src/adapters/git/repoCache.test.ts
git mv apps/backend/tests/repoCache.ensureRepo.test.ts packages/core/src/adapters/git/repoCache.ensureRepo.test.ts
```

- [ ] **Step 2: Imports in den Tests anpassen**

In `packages/core/src/adapters/git/repoCache.test.ts` ersetzen:

```ts
import { getRepoCacheDir, getCommitHash, ensureRepoSummary } from '../src/repoCache'
```
durch
```ts
import { getRepoCacheDir, getCommitHash, ensureRepoSummary } from './repoCache'
```

In `packages/core/src/adapters/git/repoCache.ensureRepo.test.ts` ersetzen:

```ts
import { ensureRepo } from '../src/repoCache'
```
durch
```ts
import { ensureRepo } from './repoCache'
```

Zusätzlich in `repoCache.test.ts` am Dateiende einen Test für die Factory anhängen:

```ts
describe('createGitRepoProvider', () => {
  it('exposes ensureRepo and ensureRepoSummary as the RepoProvider port', async () => {
    const { createGitRepoProvider } = await import('./repoCache')
    const provider = createGitRepoProvider()
    expect(typeof provider.ensureRepo).toBe('function')
    expect(typeof provider.ensureSummary).toBe('function')
  })
})
```

- [ ] **Step 3: Test laufen lassen – Factory-Test muss fehlschlagen**

Run: `npm test -w packages/core -- src/adapters/git`
Expected: FAIL – `createGitRepoProvider is not a function`; alle übrigen Repo-Cache-Tests PASS.

- [ ] **Step 4: Factory ergänzen**

In `packages/core/src/adapters/git/repoCache.ts` nach der letzten Import-Zeile (`import fsPromises from 'fs/promises'`) einfügen:

```ts
import type { RepoProvider } from '../../ports'
```

und am Dateiende anhängen:

```ts
/** RepoProvider port backed by a local git clone cache and a Claude-generated summary. */
export function createGitRepoProvider(): RepoProvider {
  return { ensureRepo, ensureSummary: ensureRepoSummary }
}
```

- [ ] **Step 5: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/core -- src/adapters/git`
Expected: PASS (10 Tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/git apps/backend
git commit -m "refactor(core): Repo-Cache als git-Adapter (RepoProvider)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Adapter `claudeCli` – Agent-CLI verschieben

**Files:**
- Move: `apps/backend/src/agentCli/` → `packages/core/src/adapters/claudeCli/` (alle 6 Dateien inkl. Tests)
- Modify: `packages/core/src/adapters/claudeCli/index.ts`
- Modify: `packages/core/src/adapters/claudeCli/errors.ts`
- Modify: `packages/core/src/adapters/claudeCli/types.ts`
- Modify: `packages/core/src/adapters/claudeCli/prompt.ts`
- Modify: `packages/core/src/adapters/claudeCli/index.test.ts`

- [ ] **Step 1: Verzeichnis verschieben**

```bash
git mv apps/backend/src/agentCli packages/core/src/adapters/claudeCli
```

- [ ] **Step 2: Tests auf die neue Schnittstelle umstellen (werden dadurch rot)**

In `packages/core/src/adapters/claudeCli/index.test.ts`:

1. Direkt nach `import type { RefinementInput } from './index'` einfügen:

```ts
import path from 'path'

const CLI_OPTIONS = { skillPath: path.resolve(__dirname, '../../../skills/refinement-agent.md') }
```

2. Alle Vorkommen (replace all) von `runRefinement(EXTRACT_INPUT, vi.fn())` durch `runRefinement(EXTRACT_INPUT, vi.fn(), CLI_OPTIONS)` ersetzen.

3. Alle Vorkommen (replace all) von `runRefinement(INPUT, vi.fn())` durch `runRefinement(INPUT, vi.fn(), CLI_OPTIONS)` ersetzen.

4. Im Test `throws TimeoutError when claude does not respond in time` die Zeilen

```ts
    const { TimeoutError } = await import('./errors')
    await expect(runRefinement(INPUT, vi.fn(), CLI_OPTIONS)).rejects.toBeInstanceOf(TimeoutError)
```
ersetzen durch
```ts
    const { AgentRunTimeoutError } = await import('../../ports')
    await expect(runRefinement(INPUT, vi.fn(), CLI_OPTIONS)).rejects.toBeInstanceOf(AgentRunTimeoutError)
```

5. Am Dateiende anhängen:

```ts
describe('createClaudeCliAgentRunner', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('runs the refinement through the AgentRunner port', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(STREAM_JSON_RESULT, 0) as any)
    const { createClaudeCliAgentRunner } = await import('./index')
    const runner = createClaudeCliAgentRunner(CLI_OPTIONS)
    const { output } = await runner.run({
      ticketId: 'T-9', title: 'T', description: 'D', acceptanceCriteria: '', repoPath: '/tmp/repo', model: 'm',
    }, vi.fn())
    expect(output.type).toBe('refinement')
  })

  it('returns false when stopping a ticket without a running process', async () => {
    const { createClaudeCliAgentRunner } = await import('./index')
    expect(createClaudeCliAgentRunner(CLI_OPTIONS).stop('T-404')).toBe(false)
  })
})
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w packages/core -- src/adapters/claudeCli`
Expected: FAIL – u. a. `createClaudeCliAgentRunner is not a function` und `AgentRunTimeoutError` erwartet, aber `TimeoutError` geworfen.

- [ ] **Step 4: `errors.ts` – Port-Fehler ersetzen die Adapter-Fehler**

In `packages/core/src/adapters/claudeCli/errors.ts` die beiden Klassen `TimeoutError` und `TerminatedError` (inkl. ihrer Doc-Kommentare) löschen. Übrig bleiben `SchemaValidationError`, `STDERR_PREVIEW_CHARS` und `CliError`.

- [ ] **Step 5: `types.ts` – Typen auf die Port-Typen zurückführen**

In `packages/core/src/adapters/claudeCli/types.ts`:

1. Die Zeile `import type { QAPair } from './prompt'` ersetzen durch:

```ts
import type { AgentRunMeta, AgentRunResult, AgentRunnerInput } from '../../ports'
```

2. Die drei Interfaces `RefinementInput`, `RefinementMeta` und `RefinementResult` (vollständig) ersetzen durch:

```ts
export type RefinementInput = AgentRunnerInput
export type RefinementMeta = AgentRunMeta
export type RefinementResult = AgentRunResult
```

- [ ] **Step 6: `prompt.ts` – QAPair aus der Domäne**

In `packages/core/src/adapters/claudeCli/prompt.ts` den Block

```ts
export interface QAPair {
  question: string
  answer: string
}
```
ersetzen durch
```ts
import type { QAPair } from '../../domain/types'

export type { QAPair }
```
und diese beiden Zeilen an den Dateianfang (vor `const MAX_RETRY_OUTPUT_CHARS`) verschieben.

- [ ] **Step 7: `index.ts` anpassen**

In `packages/core/src/adapters/claudeCli/index.ts`:

1. Die Zeile `import path from 'path'` löschen.
2. Die Zeile `import { TimeoutError, TerminatedError, SchemaValidationError, CliError } from './errors'` ersetzen durch:

```ts
import { SchemaValidationError, CliError } from './errors'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../../ports'
import type { AgentRunner } from '../../ports'
```

3. Die Zeile `const SKILL_PATH = path.join(__dirname, '../../skills/refinement-agent.md')` löschen.
4. In `parseProcessExit` `throw new TerminatedError()` ersetzen durch `throw new AgentRunTerminatedError()`.
5. In `spawnClaude` `reject(new TimeoutError(timeoutMs))` ersetzen durch `reject(new AgentRunTimeoutError(timeoutMs))`.
6. Direkt über der JSDoc von `runRefinement` einfügen:

```ts
export interface ClaudeCliOptions {
  /** Absolute path to `packages/core/skills/refinement-agent.md`. */
  skillPath: string
}
```

7. Die Signatur und erste Zeile von `runRefinement` ändern von

```ts
export async function runRefinement(
  input: RefinementInput,
  onProgress: (msg: string) => void,
): Promise<RefinementResult> {
  const skill = await fs.readFile(SKILL_PATH, UTF8)
```
zu
```ts
export async function runRefinement(
  input: RefinementInput,
  onProgress: (msg: string) => void,
  options: ClaudeCliOptions,
): Promise<RefinementResult> {
  const skill = await fs.readFile(options.skillPath, UTF8)
```

8. In der JSDoc von `runRefinement` die Zeilen `@throws {TerminatedError} ...` und `@throws {TimeoutError} ...` ersetzen durch:

```ts
 * @throws {AgentRunTerminatedError} if the process is killed via `stopRefinement`.
 * @throws {AgentRunTimeoutError} if the run exceeds `REFINEMENT_TIMEOUT_MS`.
```

9. Am Dateiende anhängen:

```ts
/** AgentRunner port backed by the headless Claude Code CLI (`claude --print`). */
export function createClaudeCliAgentRunner(options: ClaudeCliOptions): AgentRunner {
  return {
    run: (input, onProgress) => runRefinement(input, onProgress, options),
    stop: (ticketId) => stopRefinement(ticketId),
  }
}
```

- [ ] **Step 8: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/core -- src/adapters/claudeCli`
Expected: PASS (`index.test.ts` 10 Tests, `prompt.test.ts` alle Tests).

- [ ] **Step 9: Typprüfung**

Run: `npm run build -w packages/core`
Expected: Exit-Code 0.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/adapters/claudeCli apps/backend
git commit -m "refactor(core): Claude-CLI als AgentRunner-Adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Test-Fakes für die Use Cases

**Files:**
- Create: `packages/core/src/testing/fakes.ts`
- Create: `packages/core/src/testing/fakes.test.ts`

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/testing/fakes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTestContext, errorCodeOf } from './fakes'
import { ConflictError } from '../domain/errors'

describe('errorCodeOf', () => {
  it('returns the domain code or null', () => {
    expect(errorCodeOf(() => { throw new ConflictError('x') })).toBe('CONFLICT')
    expect(errorCodeOf(() => { throw new Error('x') })).toBeNull()
    expect(errorCodeOf(() => 1)).toBeNull()
  })
})

describe('in-memory repositories', () => {
  it('increment the ticket iteration when a run is created', () => {
    const ctx = createTestContext()
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    const run = ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    expect(run.iteration).toBe(1)
    expect(ctx.deps.tickets.findById(ticket.id)?.iteration).toBe(1)
    expect(ctx.deps.runs.latestForTicket(ticket.id)?.id).toBe(run.id)
  })

  it('record published events and collect background tasks', async () => {
    const ctx = createTestContext()
    let done = false
    ctx.deps.runInBackground(new Promise<void>((resolve) => setTimeout(() => { done = true; resolve() }, 5)))
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'x' })
    await ctx.settle()
    expect(done).toBe(true)
    expect(ctx.events.published).toEqual([{ type: 'progress', ticketId: 'T-1', message: 'x' }])
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/testing`
Expected: FAIL – `Failed to resolve import "./fakes"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/testing/fakes.ts`:

```ts
import type { AgentOutput, RefinementEvent } from '@refinement/shared'
import type { AgentRun, Ticket } from '../domain/types'
import type {
  AgentRunner,
  AgentRunnerInput,
  AgentRunRepository,
  AgentRunResult,
  AuditActor,
  AuditLog,
  EventPublisher,
  RepoProvider,
  TicketRepository,
} from '../ports'
import type { UseCaseDeps } from '../application/deps'
import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'
import { errorCode } from '../domain/errors'

export const SAMPLE_REFINEMENT: AgentOutput = {
  type: 'refinement',
  result: { title: 'T', userStory: 'U', acceptanceCriteria: [], affectedFiles: [], risks: [], openQuestions: [], confidence: 80 },
}

export const SAMPLE_META = {
  model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001,
}

/** Runs `fn` and returns the domain error code it throws, or null if it does not throw a domain error. */
export function errorCodeOf(fn: () => unknown): string | null {
  try {
    fn()
  } catch (err) {
    return errorCode(err)
  }
  return null
}

export interface AuditEntry {
  ticketId: number
  actor: AuditActor
  type: string
  payload?: unknown
}

export interface InMemoryStore {
  tickets: Ticket[]
  runs: AgentRun[]
  audit: AuditEntry[]
}

export function createInMemoryTicketRepository(store: InMemoryStore): TicketRepository {
  let nextId = 1
  const find = (id: number) => store.tickets.find((t) => t.id === id)
  const requireTicket = (id: number) => {
    const ticket = find(id)
    if (!ticket) throw new Error(`Ticket ${id} not found`)
    return ticket
  }
  const create = (input: { title: string; description: string }): Ticket => {
    const now = new Date()
    const ticket: Ticket = {
      id: nextId++, title: input.title, description: input.description,
      status: 'backlog', iteration: 0, createdAt: now, updatedAt: now,
    }
    store.tickets.push(ticket)
    return ticket
  }

  return {
    list: () => [...store.tickets],
    findById: (id) => find(id) ?? null,
    count: () => store.tickets.length,
    create,
    updateStatus(id, status) {
      const ticket = requireTicket(id)
      ticket.status = status
      ticket.updatedAt = new Date()
    },
    delete(id) {
      requireTicket(id)
      store.tickets = store.tickets.filter((t) => t.id !== id)
      store.runs = store.runs.filter((r) => r.ticketId !== id)
    },
    replaceAll(newTickets) {
      store.tickets = []
      store.runs = []
      store.audit = []
      return newTickets.map(create)
    },
  }
}

export function createInMemoryAgentRunRepository(store: InMemoryStore): AgentRunRepository {
  let nextId = 1
  const requireRun = (id: string) => {
    const run = store.runs.find((r) => r.id === id)
    if (!run) throw new Error(`AgentRun ${id} not found`)
    return run
  }
  const listForTicket = (ticketId: number) =>
    store.runs.filter((r) => r.ticketId === ticketId).sort((a, b) => a.iteration - b.iteration)

  return {
    create(input) {
      const ticket = store.tickets.find((t) => t.id === input.ticketId)
      if (!ticket) throw new Error(`Ticket ${input.ticketId} not found`)
      ticket.iteration += 1
      const run: AgentRun = {
        id: `run-${nextId++}`, ticketId: input.ticketId, iteration: ticket.iteration, trigger: input.trigger,
        input: input.input, output: null, status: 'running', model: input.model, costUsd: null, inputTokens: null,
        cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null, startedAt: new Date(), finishedAt: null,
      }
      store.runs.push(run)
      return run
    },
    findById: (id) => store.runs.find((r) => r.id === id) ?? null,
    complete(id, result) {
      Object.assign(requireRun(id), { status: 'succeeded', ...result, finishedAt: new Date() })
    },
    fail(id, status) {
      Object.assign(requireRun(id), { status, finishedAt: new Date() })
    },
    listForTicket,
    latestForTicket: (ticketId) => listForTicket(ticketId).at(-1) ?? null,
    findStuck: () => store.runs.filter((r) => r.status === 'running'),
  }
}

export function createInMemoryAuditLog(store: InMemoryStore): AuditLog {
  return { append: (event) => { store.audit.push(event) } }
}

/** Agent that returns `outcome` (or throws it) and records every call. */
export class FakeAgentRunner implements AgentRunner {
  readonly calls: AgentRunnerInput[] = []
  readonly stopped: string[] = []
  progress: string[] = []
  outcome: AgentRunResult | Error = { output: SAMPLE_REFINEMENT, meta: SAMPLE_META }

  async run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult> {
    this.calls.push(input)
    for (const message of this.progress) onProgress(message)
    if (this.outcome instanceof Error) throw this.outcome
    return this.outcome
  }

  stop(ticketId: string): boolean {
    this.stopped.push(ticketId)
    return true
  }
}

export class FakeRepoProvider implements RepoProvider {
  repoDir = '/repo'
  summary: string | null = null
  ensureRepoError: Error | null = null
  readonly requestedUrls: string[] = []

  async ensureRepo(url: string): Promise<string> {
    this.requestedUrls.push(url)
    if (this.ensureRepoError) throw this.ensureRepoError
    return this.repoDir
  }

  async ensureSummary(): Promise<string | null> {
    return this.summary
  }
}

export type RecordingEventPublisher = EventPublisher & { readonly published: RefinementEvent[] }

/** Real in-process bus that additionally records every published event. */
export function createRecordingEventPublisher(): RecordingEventPublisher {
  const inner = createNodeEventPublisher()
  const published: RefinementEvent[] = []
  return {
    published,
    publish(event) {
      published.push(event)
      inner.publish(event)
    },
    subscribe: inner.subscribe,
  }
}

export interface TestContext {
  deps: UseCaseDeps
  store: InMemoryStore
  agent: FakeAgentRunner
  repos: FakeRepoProvider
  events: RecordingEventPublisher
  /** Waits for all background tasks handed to `runInBackground`. */
  settle(): Promise<void>
}

export function createTestContext(): TestContext {
  const store: InMemoryStore = { tickets: [], runs: [], audit: [] }
  const agent = new FakeAgentRunner()
  const repos = new FakeRepoProvider()
  const events = createRecordingEventPublisher()
  const tasks: Promise<void>[] = []

  const deps: UseCaseDeps = {
    tickets: createInMemoryTicketRepository(store),
    runs: createInMemoryAgentRunRepository(store),
    audit: createInMemoryAuditLog(store),
    agent,
    repos,
    events,
    runInBackground: (task) => { tasks.push(task) },
    stopSettleMs: 0,
  }

  return { deps, store, agent, repos, events, settle: async () => { await Promise.all(tasks) } }
}
```

Dieser Test braucht `UseCaseDeps` aus Task 11. Deshalb jetzt `packages/core/src/application/deps.ts` anlegen:

```ts
import type {
  AgentRunner,
  AgentRunRepository,
  AuditLog,
  EventPublisher,
  RepoProvider,
  TicketRepository,
} from '../ports'

export interface UseCaseDeps {
  tickets: TicketRepository
  runs: AgentRunRepository
  audit: AuditLog
  agent: AgentRunner
  repos: RepoProvider
  events: EventPublisher
  /** Receives fire-and-forget work (agent runs). The production implementation logs rejections. */
  runInBackground: (task: Promise<void>) => void
  /** Pause after stopping an agent before the ticket state is read again (process needs time to exit). */
  stopSettleMs: number
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w packages/core -- src/testing`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/testing packages/core/src/application/deps.ts
git commit -m "test(core): In-Memory-Fakes und Test-Kontext für Use Cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Use Cases – Hilfsbausteine und Abfragen

**Files:**
- Create: `packages/core/src/application/dto.ts`
- Create: `packages/core/src/application/validation.ts`
- Create: `packages/core/src/application/requireTicket.ts`
- Create: `packages/core/src/application/reporter.ts`
- Create: `packages/core/src/application/sleep.ts`
- Create: `packages/core/src/application/queries.ts`
- Create: `packages/core/src/application/queries.test.ts`

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/application/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestContext, errorCodeOf, type TestContext } from '../testing/fakes'
import { listTickets, getTicket, getRun } from './queries'

let ctx: TestContext

beforeEach(() => {
  ctx = createTestContext()
})

const RUN_INPUT = { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' }

describe('listTickets', () => {
  it('returns DTOs with public ids', () => {
    ctx.deps.tickets.create({ title: 'A', description: 'a' })
    const [dto] = listTickets(ctx.deps)
    expect(dto).toMatchObject({ id: 'T-1', title: 'A', description: 'a', status: 'backlog', iteration: 0 })
    expect(dto.createdAt).toBeInstanceOf(Date)
  })
})

describe('getTicket', () => {
  it('returns the ticket with latestRun null when there are no runs', () => {
    ctx.deps.tickets.create({ title: 'A', description: 'a' })
    expect(getTicket(ctx.deps, 'T-1').latestRun).toBeNull()
  })

  it('returns the latest run as DTO without its input', () => {
    const ticket = ctx.deps.tickets.create({ title: 'A', description: 'a' })
    ctx.deps.runs.create({ ticketId: ticket.id, trigger: 'initial', model: 'm', input: RUN_INPUT })
    const detail = getTicket(ctx.deps, 'T-1')
    expect(detail.latestRun).toMatchObject({ id: 'run-1', ticketId: 'T-1', status: 'running', trigger: 'initial' })
    expect(detail.latestRun).not.toHaveProperty('input')
  })

  it('throws NotFoundError for unknown and malformed ids', () => {
    expect(errorCodeOf(() => getTicket(ctx.deps, 'T-99'))).toBe('NOT_FOUND')
    expect(errorCodeOf(() => getTicket(ctx.deps, 'garbage'))).toBe('NOT_FOUND')
  })
})

describe('getRun', () => {
  it('returns a run DTO or throws NotFoundError', () => {
    const ticket = ctx.deps.tickets.create({ title: 'A', description: 'a' })
    const run = ctx.deps.runs.create({ ticketId: ticket.id, trigger: 'initial', model: 'm', input: RUN_INPUT })
    expect(getRun(ctx.deps, run.id).id).toBe(run.id)
    expect(errorCodeOf(() => getRun(ctx.deps, 'nope'))).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/application/queries.test.ts`
Expected: FAIL – `Failed to resolve import "./queries"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/application/dto.ts`:

```ts
import type { AgentRunDto, TicketDto } from '@refinement/shared'
import type { AgentRun, Ticket } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'

export function toTicketDto(ticket: Ticket): TicketDto {
  return {
    id: formatTicketId(ticket.id),
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    iteration: ticket.iteration,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }
}

/** The run `input` is internal (prompt snapshot) and intentionally not exposed. */
export function toAgentRunDto(run: AgentRun): AgentRunDto {
  return {
    id: run.id,
    ticketId: formatTicketId(run.ticketId),
    iteration: run.iteration,
    trigger: run.trigger,
    status: run.status,
    model: run.model,
    output: run.output,
    costUsd: run.costUsd,
    inputTokens: run.inputTokens,
    cacheCreationTokens: run.cacheCreationTokens,
    cacheReadTokens: run.cacheReadTokens,
    outputTokens: run.outputTokens,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  }
}
```

`packages/core/src/application/validation.ts`:

```ts
import type { z } from 'zod'
import { ValidationError } from '../domain/errors'

/**
 * Validates untrusted input from a driving adapter.
 * @throws {ValidationError} with all issue messages joined.
 */
export function parseInput<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join(', '))
  }
  return result.data
}
```

`packages/core/src/application/requireTicket.ts`:

```ts
import type { Ticket } from '../domain/types'
import type { TicketRepository } from '../ports'
import { parseTicketId } from '../domain/ticketId'
import { NotFoundError } from '../domain/errors'

/**
 * Resolves a public ticket id (`T-{n}`) to the ticket.
 * @throws {NotFoundError} for malformed or unknown ids.
 */
export function requireTicket(tickets: TicketRepository, publicId: string): Ticket {
  let id: number
  try {
    id = parseTicketId(publicId)
  } catch {
    throw new NotFoundError(`Ticket ${publicId} not found`)
  }
  const ticket = tickets.findById(id)
  if (!ticket) throw new NotFoundError(`Ticket ${publicId} not found`)
  return ticket
}
```

`packages/core/src/application/reporter.ts`:

```ts
import type { TicketStatus } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'
import type { UseCaseDeps } from './deps'

/** Per-ticket helpers that keep logging, events and status changes consistent. */
export interface Reporter {
  /** Server log line only. */
  log(message: string): void
  /** Progress event only. */
  progress(message: string): void
  /** Server log line plus progress event. */
  report(message: string): void
  /** Persists the status and publishes a status event. */
  setStatus(status: TicketStatus): void
  question(question: string): void
}

export function createReporter(deps: Pick<UseCaseDeps, 'tickets' | 'events'>, ticketId: number): Reporter {
  const publicId = formatTicketId(ticketId)
  const log = (message: string) => console.log(`[${new Date().toISOString()}] [${publicId}] ${message}`)
  const progress = (message: string) => deps.events.publish({ type: 'progress', ticketId: publicId, message })

  return {
    log,
    progress,
    report: (message) => {
      log(message)
      progress(message)
    },
    setStatus: (status) => {
      deps.tickets.updateStatus(ticketId, status)
      deps.events.publish({ type: 'status', ticketId: publicId, status })
    },
    question: (question) => deps.events.publish({ type: 'question', ticketId: publicId, question }),
  }
}
```

`packages/core/src/application/sleep.ts`:

```ts
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

`packages/core/src/application/queries.ts`:

```ts
import type { AgentRunDto, TicketDetailDto, TicketDto } from '@refinement/shared'
import { NotFoundError } from '../domain/errors'
import type { UseCaseDeps } from './deps'
import { toAgentRunDto, toTicketDto } from './dto'
import { requireTicket } from './requireTicket'

export function listTickets(deps: UseCaseDeps): TicketDto[] {
  return deps.tickets.list().map(toTicketDto)
}

export function getTicket(deps: UseCaseDeps, ticketId: string): TicketDetailDto {
  const ticket = requireTicket(deps.tickets, ticketId)
  const latestRun = deps.runs.latestForTicket(ticket.id)
  return { ...toTicketDto(ticket), latestRun: latestRun ? toAgentRunDto(latestRun) : null }
}

export function getRun(deps: UseCaseDeps, runId: string): AgentRunDto {
  const run = deps.runs.findById(runId)
  if (!run) throw new NotFoundError(`Run ${runId} not found`)
  return toAgentRunDto(run)
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w packages/core -- src/application/queries.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application
git commit -m "feat(core): Use-Case-Bausteine (DTOs, Validierung, Reporter) und Abfragen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Use Cases – Agent-Lauf im Hintergrund

**Files:**
- Create: `packages/core/src/application/executeRun.ts`
- Create: `packages/core/src/application/refinementJobs.ts`
- Create: `packages/core/src/application/refinementJobs.test.ts`

Portiert `executeRun`, `startRefinement` und `startAnswerRun` aus `apps/backend/src/refinementOrchestrator.ts` 1:1 (Meldungstexte unverändert).

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/application/refinementJobs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestContext, SAMPLE_META, type TestContext } from '../testing/fakes'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import { runInitialRefinement, runAnswer } from './refinementJobs'
import type { Ticket } from '../domain/types'

let ctx: TestContext
let ticket: Ticket

const PARAMS = { repo: 'https://github.com/x/y', model: 'm', acceptanceCriteria: 'AC' }

beforeEach(() => {
  ctx = createTestContext()
  ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
  ctx.deps.tickets.updateStatus(ticket.id, 'refining')
})

const progressMessages = () =>
  ctx.events.published.flatMap((e) => (e.type === 'progress' ? [e.message] : []))

describe('runInitialRefinement', () => {
  it('completes the run and moves the ticket to review on a refinement', async () => {
    ctx.repos.summary = '# Summary'
    await runInitialRefinement(ctx.deps, ticket, PARAMS)

    const [run] = ctx.store.runs
    expect(run).toMatchObject({ status: 'succeeded', trigger: 'initial', costUsd: SAMPLE_META.costUsd })
    expect(run.input).toEqual({ ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: 'AC', repo: PARAMS.repo, model: 'm' })
    expect(ctx.agent.calls[0]).toMatchObject({ ticketId: 'T-1', repoPath: '/repo', codebaseSummary: '# Summary' })
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('review')
    expect(ctx.events.published.at(-1)).toEqual({ type: 'status', ticketId: 'T-1', status: 'review' })
    expect(ctx.store.audit.map((a) => a.type)).toEqual(['run_started', 'run_finished'])
    expect(progressMessages()).toEqual([
      'Repository wird vorbereitet...',
      'Repository bereit.',
      'Agent wird gestartet...',
    ])
  })

  it('announces a missing codebase summary', async () => {
    ctx.repos.summary = null
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(progressMessages()).toContain('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  })

  it('keeps the ticket refining and publishes the question on a question output', async () => {
    ctx.agent.outcome = { output: { type: 'question', question: 'Welche DB?' }, meta: SAMPLE_META }
    await runInitialRefinement(ctx.deps, ticket, PARAMS)

    expect(ctx.store.runs[0].status).toBe('succeeded')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('refining')
    expect(ctx.events.published.slice(-2)).toEqual([
      { type: 'progress', ticketId: 'T-1', message: 'Agent stellt eine Rückfrage...' },
      { type: 'question', ticketId: 'T-1', question: 'Welche DB?' },
    ])
  })

  it('forwards agent progress as events', async () => {
    ctx.agent.progress = ['Codebase wird analysiert...']
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(progressMessages()).toContain('Codebase wird analysiert...')
  })

  it('marks run and ticket failed on agent errors', async () => {
    ctx.agent.outcome = new Error('boom')
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('failed')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
    expect(progressMessages()).toContain('Fehler: boom')
  })

  it('marks the run as timeout on AgentRunTimeoutError', async () => {
    ctx.agent.outcome = new AgentRunTimeoutError(50)
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('timeout')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
  })

  it('returns the ticket to backlog when the run was stopped', async () => {
    ctx.agent.outcome = new AgentRunTerminatedError()
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs[0].status).toBe('failed')
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('backlog')
  })

  it('fails without creating a run when the repository cannot be loaded', async () => {
    ctx.repos.ensureRepoError = Object.assign(new Error('clone failed'), { stderr: Buffer.from('fatal: not found') })
    await runInitialRefinement(ctx.deps, ticket, PARAMS)
    expect(ctx.store.runs).toHaveLength(0)
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
    expect(progressMessages()).toContain('Fehler: Repository konnte nicht geladen werden. (fatal: not found)')
  })
})

describe('runAnswer', () => {
  function askQuestion() {
    const run = ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'initial', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: 'AC', repo: PARAMS.repo, model: 'm' },
    })
    ctx.deps.runs.complete(run.id, {
      output: { type: 'question', question: 'Welche DB?' },
      costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
  }

  it('aborts silently when no question is pending', async () => {
    await runAnswer(ctx.deps, ticket, 'egal')
    expect(ctx.store.runs).toHaveLength(0)
    expect(ctx.agent.calls).toHaveLength(0)
  })

  it('starts an answer run with the Q&A history and the original repo and model', async () => {
    askQuestion()
    await runAnswer(ctx.deps, ticket, 'Postgres')

    const answerRun = ctx.store.runs[1]
    expect(answerRun.trigger).toBe('answer')
    expect(answerRun.input.previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
    expect(ctx.repos.requestedUrls).toEqual([PARAMS.repo])
    expect(ctx.agent.calls[0].previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('review')
    expect(progressMessages()[0]).toBe('Antwort empfangen — Agent analysiert Antwort...')
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/application/refinementJobs.test.ts`
Expected: FAIL – `Failed to resolve import "./refinementJobs"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/application/executeRun.ts`:

```ts
import type { AgentRunInput, QAPair } from '../domain/types'
import { formatTicketId } from '../domain/ticketId'
import { statusAfterRun } from '../domain/rules'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'

export interface RunRequest {
  trigger: 'initial' | 'answer'
  input: AgentRunInput
  repoPath: string
  codebaseSummary: string | null
  previousRuns?: QAPair[]
}

/**
 * Creates a run, executes the agent and records the outcome.
 * Never throws: every error ends in a terminal run status and a ticket status change.
 */
export async function executeRun(deps: UseCaseDeps, ticketId: number, request: RunRequest): Promise<void> {
  const reporter = createReporter(deps, ticketId)
  const run = deps.runs.create({ ticketId, trigger: request.trigger, model: request.input.model, input: request.input })
  deps.audit.append({ ticketId, actor: 'system', type: 'run_started', payload: { runId: run.id } })

  try {
    const { output, meta } = await deps.agent.run(
      {
        ticketId: formatTicketId(ticketId),
        title: request.input.ticketTitle,
        description: request.input.ticketDescription,
        acceptanceCriteria: request.input.acceptanceCriteria,
        repoPath: request.repoPath,
        model: request.input.model,
        codebaseSummary: request.codebaseSummary ?? undefined,
        previousRuns: request.previousRuns,
      },
      reporter.report,
    )

    reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
    deps.runs.complete(run.id, {
      output,
      costUsd: meta.costUsd,
      inputTokens: meta.inputTokens,
      cacheCreationTokens: meta.cacheCreationTokens,
      cacheReadTokens: meta.cacheReadTokens,
      outputTokens: meta.outputTokens,
    })
    deps.audit.append({ ticketId, actor: 'agent', type: 'run_finished', payload: { runId: run.id, status: 'succeeded' } })

    if (output.type === 'question') {
      reporter.progress('Agent stellt eine Rückfrage...')
      reporter.question(output.question)
    } else {
      reporter.setStatus(statusAfterRun(output))
    }
  } catch (err) {
    if (err instanceof AgentRunTerminatedError) {
      reporter.log('Refinement terminated by user')
      deps.runs.fail(run.id, 'failed')
      deps.audit.append({ ticketId, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: 'failed' } })
      reporter.setStatus('backlog')
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    reporter.log(`ERROR: ${message}`)
    reporter.progress(`Fehler: ${message}`)
    const runStatus = err instanceof AgentRunTimeoutError ? 'timeout' : 'failed'
    deps.runs.fail(run.id, runStatus)
    deps.audit.append({ ticketId, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: runStatus } })
    reporter.setStatus('failed')
  }
}
```

`packages/core/src/application/refinementJobs.ts`:

```ts
import type { StartRefinementInput } from '@refinement/shared'
import type { Ticket } from '../domain/types'
import { planAnswerRun } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { createReporter, type Reporter } from './reporter'
import { executeRun } from './executeRun'

function describeRepoError(err: unknown): string {
  const stderr = (err as { stderr?: Buffer } | null)?.stderr?.toString().trim()
  return stderr || (err instanceof Error ? err.message : String(err))
}

/** Clones/updates the repo. On failure the ticket is marked failed and null is returned. */
async function prepareRepo(deps: UseCaseDeps, reporter: Reporter, repoUrl: string): Promise<string | null> {
  try {
    return await deps.repos.ensureRepo(repoUrl)
  } catch (err) {
    const detail = describeRepoError(err)
    reporter.log(`Repository error: ${detail}`)
    reporter.setStatus('failed')
    reporter.progress(`Fehler: Repository konnte nicht geladen werden. (${detail})`)
    return null
  }
}

/** Background job of `startRefinement`: repo → summary → first agent run. */
export async function runInitialRefinement(deps: UseCaseDeps, ticket: Ticket, params: StartRefinementInput): Promise<void> {
  const reporter = createReporter(deps, ticket.id)
  reporter.log(`Starting refinement for "${ticket.title}"`)

  reporter.progress('Repository wird vorbereitet...')
  const repoDir = await prepareRepo(deps, reporter, params.repo)
  if (!repoDir) return
  reporter.progress('Repository bereit.')

  const summary = await deps.repos.ensureSummary(repoDir, params.model, reporter.report)
  if (!summary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  reporter.progress('Agent wird gestartet...')

  await executeRun(deps, ticket.id, {
    trigger: 'initial',
    repoPath: repoDir,
    codebaseSummary: summary,
    input: {
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      acceptanceCriteria: params.acceptanceCriteria,
      repo: params.repo,
      model: params.model,
    },
  })
}

/** Background job of `answerQuestion`: continues with the Q&A history in a new agent run. */
export async function runAnswer(deps: UseCaseDeps, ticket: Ticket, answer: string): Promise<void> {
  const reporter = createReporter(deps, ticket.id)
  const plan = planAnswerRun(deps.runs.listForTicket(ticket.id), answer)
  if (!plan) {
    reporter.log('ERROR: no pending question found — aborting answer run')
    return
  }
  const initialInput = plan.questionRun.input

  // Ticket is already 'refining' — no status transition needed, the progress event signals the start.
  reporter.progress('Antwort empfangen — Agent analysiert Antwort...')
  reporter.log(`Starting answer run for "${ticket.title}" (${plan.previousRuns.length} Q&A pair(s))`)

  const repoDir = await prepareRepo(deps, reporter, initialInput.repo)
  if (!repoDir) return

  const summary = await deps.repos.ensureSummary(repoDir, initialInput.model, reporter.report)
  reporter.progress('Agent wird gestartet...')

  await executeRun(deps, ticket.id, {
    trigger: 'answer',
    repoPath: repoDir,
    codebaseSummary: summary,
    previousRuns: plan.previousRuns,
    input: {
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      acceptanceCriteria: initialInput.acceptanceCriteria,
      repo: initialInput.repo,
      model: initialInput.model,
      previousRuns: plan.previousRuns,
    },
  })
}
```

- [ ] **Step 4: Test laufen lassen – muss grün sein**

Run: `npm test -w packages/core -- src/application/refinementJobs.test.ts`
Expected: PASS (10 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application
git commit -m "feat(core): Agent-Lauf und Hintergrund-Jobs für Refinement und Antwort

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Use Cases – Befehle, Start, Factory

**Files:**
- Create: `packages/core/src/application/commands.ts`
- Create: `packages/core/src/application/commands.test.ts`
- Create: `packages/core/src/application/startup.ts`
- Create: `packages/core/src/application/startup.test.ts`
- Create: `packages/core/src/application/createUseCases.ts`

- [ ] **Step 1: Failing tests schreiben**

`packages/core/src/application/commands.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestContext, errorCodeOf, SAMPLE_META, SAMPLE_REFINEMENT, type TestContext } from '../testing/fakes'
import { createUseCases, type UseCases } from './createUseCases'
import { SEED_TICKETS } from '../domain/seeds'

let ctx: TestContext
let useCases: UseCases

beforeEach(() => {
  ctx = createTestContext()
  useCases = createUseCases(ctx.deps)
})

const START = { repo: 'https://github.com/x/y', model: 'm' }

describe('createTicket', () => {
  it('creates the ticket and writes an audit event', () => {
    const dto = useCases.createTicket({ title: 'Neu', description: 'Beschreibung' })
    expect(dto).toMatchObject({ id: 'T-1', title: 'Neu', status: 'backlog' })
    expect(ctx.store.audit).toEqual([{ ticketId: 1, actor: 'human', type: 'ticket_created', payload: null }])
  })

  it('rejects invalid input with a ValidationError', () => {
    expect(errorCodeOf(() => useCases.createTicket({ title: 'x' }))).toBe('VALIDATION')
  })
})

describe('startRefinement', () => {
  it('sets refining, publishes the status and runs the agent in the background', async () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    useCases.startRefinement('T-1', START)

    expect(useCases.getTicket('T-1').status).toBe('refining')
    expect(ctx.events.published[0]).toEqual({ type: 'status', ticketId: 'T-1', status: 'refining' })

    await ctx.settle()
    expect(useCases.getTicket('T-1').status).toBe('review')
    expect(ctx.agent.calls[0]).toMatchObject({ acceptanceCriteria: '' })
  })

  it('rejects unknown tickets, invalid input and non-refineable states', () => {
    expect(errorCodeOf(() => useCases.startRefinement('T-9', START))).toBe('NOT_FOUND')
    useCases.createTicket({ title: 'T', description: 'D' })
    expect(errorCodeOf(() => useCases.startRefinement('T-1', { model: 'm' }))).toBe('VALIDATION')
    useCases.startRefinement('T-1', START)
    expect(errorCodeOf(() => useCases.startRefinement('T-1', START))).toBe('CONFLICT')
  })
})

describe('answerQuestion', () => {
  it('rejects answers when the ticket is not refining', () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: 'x' }))).toBe('CONFLICT')
  })

  it('rejects a second answer while the first is still running', () => {
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(ticket.id, 'refining')
    ctx.deps.runs.create({
      ticketId: ticket.id, trigger: 'answer', model: 'm',
      input: { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' },
    })
    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: 'x' }))).toBe('CONFLICT')
    expect(() => useCases.answerQuestion('T-1', { answer: 'x' })).toThrow('Answer already in progress')
  })

  it('validates the answer and continues in the background', async () => {
    ctx.agent.outcome = { output: { type: 'question', question: 'Welche DB?' }, meta: SAMPLE_META }
    useCases.createTicket({ title: 'T', description: 'D' })
    useCases.startRefinement('T-1', START)
    await ctx.settle()

    expect(errorCodeOf(() => useCases.answerQuestion('T-1', { answer: '  ' }))).toBe('VALIDATION')

    ctx.agent.outcome = { output: SAMPLE_REFINEMENT, meta: SAMPLE_META }
    useCases.answerQuestion('T-1', { answer: 'Postgres' })
    await ctx.settle()
    expect(useCases.getTicket('T-1').status).toBe('review')
    expect(ctx.agent.calls[1].previousRuns).toEqual([{ question: 'Welche DB?', answer: 'Postgres' }])
  })
})

describe('stopRefinement', () => {
  it('stops the agent and returns a refining ticket to backlog', async () => {
    useCases.createTicket({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(1, 'refining')
    await useCases.stopRefinement('T-1')
    expect(ctx.agent.stopped).toEqual(['T-1'])
    expect(useCases.getTicket('T-1').status).toBe('backlog')
    expect(ctx.events.published.at(-1)).toEqual({ type: 'status', ticketId: 'T-1', status: 'backlog' })
  })

  it('ignores unknown tickets', async () => {
    await expect(useCases.stopRefinement('T-404')).resolves.toBeUndefined()
  })
})

describe('deleteTicket', () => {
  it('deletes idle tickets and refuses while refining', () => {
    useCases.createTicket({ title: 'A', description: 'a' })
    useCases.createTicket({ title: 'B', description: 'b' })
    ctx.deps.tickets.updateStatus(2, 'refining')

    useCases.deleteTicket('T-1')
    expect(useCases.listTickets().map((t) => t.id)).toEqual(['T-2'])
    expect(errorCodeOf(() => useCases.deleteTicket('T-2'))).toBe('CONFLICT')
    expect(errorCodeOf(() => useCases.deleteTicket('T-9'))).toBe('NOT_FOUND')
  })
})

describe('resetSystem', () => {
  it('stops running agents and restores the seed tickets', async () => {
    useCases.createTicket({ title: 'A', description: 'a' })
    ctx.deps.tickets.updateStatus(1, 'refining')

    const tickets = await useCases.resetSystem()

    expect(ctx.agent.stopped).toEqual(['T-1'])
    expect(tickets.map((t) => t.title)).toEqual(SEED_TICKETS.map((s) => s.title))
  })
})

describe('subscribeToTicket', () => {
  it('delivers events of the ticket until unsubscribed', () => {
    const received: string[] = []
    const unsubscribe = useCases.subscribeToTicket('T-1', (e) => received.push(e.type))
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'x' })
    unsubscribe()
    ctx.deps.events.publish({ type: 'progress', ticketId: 'T-1', message: 'y' })
    expect(received).toEqual(['progress'])
  })
})
```

`packages/core/src/application/startup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTestContext } from '../testing/fakes'
import { startup } from './startup'

const RUN_INPUT = { ticketTitle: 'T', ticketDescription: 'D', acceptanceCriteria: '', repo: 'r', model: 'm' }

describe('startup', () => {
  it('seeds an empty database with the three example tickets', () => {
    const ctx = createTestContext()
    startup(ctx.deps)
    expect(ctx.deps.tickets.count()).toBe(3)
  })

  it('does not seed when tickets exist', () => {
    const ctx = createTestContext()
    ctx.deps.tickets.create({ title: 'Mine', description: 'x' })
    startup(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => t.title)).toEqual(['Mine'])
  })

  it('marks runs left running after a crash as failed, including their tickets', () => {
    const ctx = createTestContext()
    const ticket = ctx.deps.tickets.create({ title: 'T', description: 'D' })
    ctx.deps.tickets.updateStatus(ticket.id, 'refining')
    const run = ctx.deps.runs.create({ ticketId: ticket.id, trigger: 'initial', model: 'm', input: RUN_INPUT })

    startup(ctx.deps)

    expect(ctx.deps.runs.findById(run.id)?.status).toBe('failed')
    expect(ctx.deps.runs.findById(run.id)?.finishedAt).toBeInstanceOf(Date)
    expect(ctx.deps.tickets.findById(ticket.id)?.status).toBe('failed')
  })
})
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w packages/core -- src/application/commands.test.ts src/application/startup.test.ts`
Expected: FAIL – `Failed to resolve import "./createUseCases"` bzw. `"./startup"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/application/commands.ts`:

```ts
import { AnswerInput, CreateTicketInput, StartRefinementInput, type TicketDto } from '@refinement/shared'
import { ConflictError } from '../domain/errors'
import { canDelete, canStartRefinement, isAnswerInProgress } from '../domain/rules'
import { formatTicketId } from '../domain/ticketId'
import { SEED_TICKETS } from '../domain/seeds'
import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { toTicketDto } from './dto'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { runAnswer, runInitialRefinement } from './refinementJobs'
import { sleep } from './sleep'

export function createTicket(deps: UseCaseDeps, raw: unknown): TicketDto {
  const input = parseInput(CreateTicketInput, raw)
  const ticket = deps.tickets.create(input)
  deps.audit.append({ ticketId: ticket.id, actor: 'human', type: 'ticket_created', payload: null })
  return toTicketDto(ticket)
}

/** Validates, sets `refining` and hands the agent run to the background. Returns immediately. */
export function startRefinement(deps: UseCaseDeps, ticketId: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (!canStartRefinement(ticket)) throw new ConflictError('Ticket is not in a refineable state')
  const input = parseInput(StartRefinementInput, raw)

  createReporter(deps, ticket.id).setStatus('refining')
  deps.runInBackground(runInitialRefinement(deps, ticket, input))
}

/** Validates and continues the refinement with the answer in the background. Returns immediately. */
export function answerQuestion(deps: UseCaseDeps, ticketId: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (ticket.status !== 'refining') throw new ConflictError('Ticket is not awaiting an answer')
  if (isAnswerInProgress(deps.runs.latestForTicket(ticket.id))) throw new ConflictError('Answer already in progress')
  const { answer } = parseInput(AnswerInput, raw)

  deps.runInBackground(runAnswer(deps, ticket, answer))
}

/**
 * Stops the agent and, once it had time to exit, returns a still-refining ticket to backlog.
 * Unknown tickets are ignored (stop is idempotent).
 */
export async function stopRefinement(deps: UseCaseDeps, ticketId: string): Promise<void> {
  deps.agent.stop(ticketId)
  await sleep(deps.stopSettleMs)

  let ticket: Ticket
  try {
    ticket = requireTicket(deps.tickets, ticketId)
  } catch {
    return
  }
  if (ticket.status === 'refining') createReporter(deps, ticket.id).setStatus('backlog')
}

export function deleteTicket(deps: UseCaseDeps, ticketId: string): void {
  const ticket = requireTicket(deps.tickets, ticketId)
  if (!canDelete(ticket)) throw new ConflictError('Cannot delete a ticket while refinement is running')
  deps.tickets.delete(ticket.id)
}

/** Stops all running agents and restores the three seed tickets. */
export async function resetSystem(deps: UseCaseDeps): Promise<TicketDto[]> {
  for (const ticket of deps.tickets.list()) {
    if (ticket.status === 'refining') deps.agent.stop(formatTicketId(ticket.id))
  }
  await sleep(deps.stopSettleMs)
  return deps.tickets.replaceAll(SEED_TICKETS).map(toTicketDto)
}
```

`packages/core/src/application/startup.ts`:

```ts
import { SEED_TICKETS } from '../domain/seeds'
import type { UseCaseDeps } from './deps'

/**
 * Runs once at process start, before requests are served:
 * seeds an empty database and fails runs that were interrupted by a crash.
 */
export function startup(deps: UseCaseDeps): void {
  if (deps.tickets.count() === 0) {
    deps.tickets.replaceAll(SEED_TICKETS)
    console.log(`[startup] seeded ${SEED_TICKETS.length} default tickets`)
  }

  const stuck = deps.runs.findStuck()
  for (const run of stuck) {
    deps.runs.fail(run.id, 'failed')
    deps.tickets.updateStatus(run.ticketId, 'failed')
    console.log(`[startup] recovered stuck run ${run.id} for ticket ${run.ticketId}`)
  }
  if (stuck.length > 0) console.log(`[startup] recovered ${stuck.length} stuck run(s)`)
}
```

`packages/core/src/application/createUseCases.ts`:

```ts
import type { AgentRunDto, RefinementEvent, TicketDetailDto, TicketDto } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { getRun, getTicket, listTickets } from './queries'
import { answerQuestion, createTicket, deleteTicket, resetSystem, startRefinement, stopRefinement } from './commands'
import { startup } from './startup'

/**
 * Everything a driving adapter (Hono, Next.js) may call.
 * Inputs typed `unknown` are validated inside; domain errors carry `code` (see `errorCode`).
 */
export interface UseCases {
  listTickets(): TicketDto[]
  getTicket(ticketId: string): TicketDetailDto
  getRun(runId: string): AgentRunDto
  createTicket(input: unknown): TicketDto
  startRefinement(ticketId: string, input: unknown): void
  answerQuestion(ticketId: string, input: unknown): void
  stopRefinement(ticketId: string): Promise<void>
  deleteTicket(ticketId: string): void
  resetSystem(): Promise<TicketDto[]>
  subscribeToTicket(ticketId: string, handler: (event: RefinementEvent) => void): () => void
  startup(): void
}

export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    listTickets: () => listTickets(deps),
    getTicket: (ticketId) => getTicket(deps, ticketId),
    getRun: (runId) => getRun(deps, runId),
    createTicket: (input) => createTicket(deps, input),
    startRefinement: (ticketId, input) => startRefinement(deps, ticketId, input),
    answerQuestion: (ticketId, input) => answerQuestion(deps, ticketId, input),
    stopRefinement: (ticketId) => stopRefinement(deps, ticketId),
    deleteTicket: (ticketId) => deleteTicket(deps, ticketId),
    resetSystem: () => resetSystem(deps),
    subscribeToTicket: (ticketId, handler) => deps.events.subscribe(ticketId, handler),
    startup: () => startup(deps),
  }
}
```

- [ ] **Step 4: Tests laufen lassen – müssen grün sein**

Run: `npm test -w packages/core -- src/application`
Expected: PASS (queries, refinementJobs, commands, startup).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application
git commit -m "feat(core): Use Cases für Tickets, Refinement, Antwort, Stop, Reset und Start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Komposition und öffentliche API des Kerns

**Files:**
- Create: `packages/core/src/compose.ts`
- Create: `packages/core/src/compose.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Failing test schreiben**

`packages/core/src/compose.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRefinementEngine, resolveCorePaths } from './compose'

const CORE_DIR = path.resolve(__dirname, '..')

describe('resolveCorePaths', () => {
  it('points to the shipped migrations and skill file', () => {
    const paths = resolveCorePaths(CORE_DIR)
    expect(fs.existsSync(path.join(paths.migrationsFolder, 'meta', '_journal.json'))).toBe(true)
    expect(fs.existsSync(paths.skillPath)).toBe(true)
  })
})

describe('createRefinementEngine', () => {
  it('creates the database file, migrates and serves use cases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    const dbPath = path.join(dir, 'nested', 'refinement.db')
    const engine = createRefinementEngine({ dbPath, ...resolveCorePaths(CORE_DIR) })

    engine.startup()

    expect(fs.existsSync(dbPath)).toBe(true)
    expect(engine.listTickets()).toHaveLength(3)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm test -w packages/core -- src/compose.test.ts`
Expected: FAIL – `Failed to resolve import "./compose"`.

- [ ] **Step 3: Implementierung**

`packages/core/src/compose.ts`:

```ts
import path from 'path'
import { createUseCases, type UseCases } from './application/createUseCases'
import { createSqliteDatabase } from './adapters/sqlite/database'
import { createSqliteTicketRepository } from './adapters/sqlite/ticketRepository'
import { createSqliteAgentRunRepository } from './adapters/sqlite/agentRunRepository'
import { createSqliteAuditLog } from './adapters/sqlite/auditLog'
import { createClaudeCliAgentRunner } from './adapters/claudeCli'
import { createGitRepoProvider } from './adapters/git/repoCache'
import { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'

export interface EngineConfig {
  /** SQLite file; parent directories are created. */
  dbPath: string
  /** `packages/core/drizzle` */
  migrationsFolder: string
  /** `packages/core/skills/refinement-agent.md` */
  skillPath: string
}

const STOP_SETTLE_MS = 500

/**
 * Paths of the assets shipped with this package. Passed in from the app because bundlers
 * (Next.js) relocate the code, so `__dirname` inside the package is not reliable.
 * @param coreDir - Absolute path to `packages/core`.
 */
export function resolveCorePaths(coreDir: string): Pick<EngineConfig, 'migrationsFolder' | 'skillPath'> {
  return {
    migrationsFolder: path.join(coreDir, 'drizzle'),
    skillPath: path.join(coreDir, 'skills', 'refinement-agent.md'),
  }
}

/** Composition of the production adapters. Call once per process and keep the result. */
export function createRefinementEngine(config: EngineConfig): UseCases {
  const db = createSqliteDatabase({ path: config.dbPath, migrationsFolder: config.migrationsFolder })
  return createUseCases({
    tickets: createSqliteTicketRepository(db),
    runs: createSqliteAgentRunRepository(db),
    audit: createSqliteAuditLog(db),
    agent: createClaudeCliAgentRunner({ skillPath: config.skillPath }),
    repos: createGitRepoProvider(),
    events: createNodeEventPublisher(),
    runInBackground: (task) => {
      task.catch((err) => console.error('[background] unhandled error in agent run', err))
    },
    stopSettleMs: STOP_SETTLE_MS,
  })
}
```

`packages/core/src/index.ts` (komplett ersetzen):

```ts
export { createRefinementEngine, resolveCorePaths } from './compose'
export type { EngineConfig } from './compose'

export { createUseCases } from './application/createUseCases'
export type { UseCases } from './application/createUseCases'
export type { UseCaseDeps } from './application/deps'

export { NotFoundError, ConflictError, ValidationError, errorCode } from './domain/errors'
export type { DomainErrorCode } from './domain/errors'
export { formatTicketId, parseTicketId } from './domain/ticketId'
export type { Ticket, AgentRun, AgentRunInput, QAPair } from './domain/types'

export * from './ports'

export { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'
```

- [ ] **Step 4: Gesamte Kern-Suite und Typprüfung**

Run: `npm test -w packages/core && npm run build -w packages/core`
Expected: alle Tests PASS, `tsc` Exit-Code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): createRefinementEngine verdrahtet die echten Adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Abhängigkeitsregel per ESLint erzwingen

**Files:**
- Create: `packages/core/eslint.config.mjs`

- [ ] **Step 1: Konfiguration anlegen**

`packages/core/eslint.config.mjs`:

```js
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// Only one job: keep the hexagon clean. Domain, ports and use cases must not reach adapters or I/O.
export default defineConfig([
  {
    files: ['src/domain/**/*.ts', 'src/ports/**/*.ts', 'src/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/adapters', '**/adapters/**', '**/compose'],
            message: 'Hexagonal: Domäne, Ports und Use Cases dürfen keine Adapter importieren.',
          },
          {
            group: ['better-sqlite3', 'drizzle-orm', 'drizzle-orm/*', 'child_process', 'fs', 'fs/promises', 'events'],
            message: 'Hexagonal: I/O gehört in einen Adapter hinter einem Port.',
          },
        ],
      }],
    },
  },
])
```

- [ ] **Step 2: Lint auf dem aktuellen Stand – muss grün sein**

Run: `npm run lint -w packages/core`
Expected: keine Ausgabe, Exit-Code 0.

- [ ] **Step 3: Regel prüfen – Verstoß muss erkannt werden**

```bash
printf "import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'\nexport const x = createNodeEventPublisher\n" > packages/core/src/application/lintProbe.ts
npm run lint -w packages/core
```
Expected: FAIL mit `Hexagonal: Domäne, Ports und Use Cases dürfen keine Adapter importieren.` in `src/application/lintProbe.ts`.

```bash
rm packages/core/src/application/lintProbe.ts
npm run lint -w packages/core
```
Expected: Exit-Code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/core/eslint.config.mjs package-lock.json
git commit -m "chore(core): ESLint erzwingt die Abhängigkeitsrichtung des Hexagons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: `apps/backend` wird dünner Hono-Adapter

**Files:**
- Create: `apps/backend/src/engine.ts`
- Rewrite: `apps/backend/src/restApi.ts`, `apps/backend/src/sseLayer.ts`, `apps/backend/src/index.ts`
- Rewrite: `apps/backend/tests/restApi.test.ts`, `apps/backend/tests/sseLayer.test.ts`
- Delete: `apps/backend/src/db/` (Rest), `apps/backend/src/events.ts`, `apps/backend/src/refinementOrchestrator.ts`, `apps/backend/tests/refinementOrchestrator.test.ts`, `apps/backend/tests/setup.ts`
- Modify: `apps/backend/package.json`, `apps/backend/vitest.config.ts`, `apps/backend/drizzle.config.ts` (löschen)

- [ ] **Step 1: Alte Module löschen**

```bash
git rm -r apps/backend/src/db apps/backend/src/events.ts apps/backend/src/refinementOrchestrator.ts \
  apps/backend/tests/refinementOrchestrator.test.ts apps/backend/tests/setup.ts apps/backend/drizzle.config.ts
```

- [ ] **Step 2: Paket- und Testkonfiguration anpassen**

`apps/backend/package.json` (komplett ersetzen):

```json
{
  "name": "backend",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "type": "commonjs",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.14",
    "@refinement/core": "*",
    "@refinement/shared": "*",
    "hono": "^4.12.27"
  },
  "devDependencies": {
    "@types/node": "^25.9.3",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

`apps/backend/vitest.config.ts` (komplett ersetzen):

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
  },
})
```

Run: `npm install`
Expected: ohne Fehler.

- [ ] **Step 3: Failing tests schreiben**

`apps/backend/tests/restApi.test.ts` (komplett ersetzen):

```ts
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
    const body = { repo: 'https://github.com/x/y', model: 'm' }
    expect((await app.request('/tickets/T-1/refine', json(body))).status).toBe(202)
    expect((await app.request('/tickets/T-1/refine', json(body))).status).toBe(409)
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
```

`apps/backend/tests/sseLayer.test.ts` (komplett ersetzen):

```ts
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
    const { app, events } = setup()
    const { server, port } = await startServer(app)
    const { req } = await openSSE(port, 'T-4')
    await wait(50)
    req.destroy()
    await wait(50)
    expect(() => events.publish({ type: 'progress', ticketId: 'T-4', message: 'after' })).not.toThrow()
    await close(server)
  })
})
```

- [ ] **Step 4: Tests laufen lassen – müssen fehlschlagen**

Run: `npm test -w apps/backend`
Expected: FAIL – `createApp` erwartet keine Argumente bzw. Imports aus `../src/db/...` fehlen in `restApi.ts`.

- [ ] **Step 5: Adapter implementieren**

`apps/backend/src/engine.ts`:

```ts
import path from 'path'
import { createRefinementEngine, resolveCorePaths } from '@refinement/core'

const CORE_DIR = path.resolve(__dirname, '../../../packages/core')

/** Process-wide engine of the Hono transition adapter (removed in part 3). */
export const engine = createRefinementEngine({
  dbPath: process.env.DB_PATH ?? path.join(__dirname, '../data/refinement.db'),
  ...resolveCorePaths(CORE_DIR),
})
```

`apps/backend/src/restApi.ts` (komplett ersetzen):

```ts
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
    await engine.stopRefinement(c.req.param('id'))
    return c.json({ message: 'Refinement stopped' }, 202)
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
```

`apps/backend/src/sseLayer.ts` (komplett ersetzen):

```ts
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { UseCases } from '@refinement/core'

/**
 * Registers `GET /events?ticketId=<id>`: one subscription per connection,
 * removed when the client disconnects. Several tabs per ticket are supported.
 */
export function initSSE(app: Hono, engine: UseCases): void {
  app.get('/events', (c) => {
    const ticketId = c.req.query('ticketId')
    if (!ticketId) return c.json({ error: 'ticketId query parameter is required' }, 400)

    return streamSSE(c, async (stream) => {
      // Comment frame flushes proxy buffers; the leading ':' makes it a no-op for EventSource.
      await stream.write(': ok\n\n')
      const unsubscribe = engine.subscribeToTicket(ticketId, (event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch((err) => {
          console.warn('[SSE] client disconnected mid-send for ticket', ticketId, err)
        })
      })
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      unsubscribe()
    })
  })
}
```

`apps/backend/src/index.ts` (komplett ersetzen):

```ts
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
```

- [ ] **Step 6: Tests laufen lassen – müssen grün sein**

Run: `npm test -w apps/backend`
Expected: PASS (restApi 10 Tests, sseLayer 4 Tests).

- [ ] **Step 7: Prüfen, dass im Backend keine Fachlogik übrig ist**

Run: `ls apps/backend/src`
Expected: genau `engine.ts index.ts restApi.ts sseLayer.ts`.

- [ ] **Step 8: Commit**

```bash
git add -A apps/backend package-lock.json
git commit -m "refactor(backend): Hono als dünner Adapter auf @refinement/core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Abnahme Teil 1 – alles grün, alte App verhält sich identisch

- [ ] **Step 1: Alle Tests und Builds**

Run: `npm test && npm run build && npm run lint -w packages/core`
Expected: alle Workspaces PASS; `tsc` im Backend und im Kern ohne Fehler; Vite-Build des Frontends erfolgreich.

- [ ] **Step 2: Alte App starten**

Prüfe vorher mit `lsof -iTCP:3000 -iTCP:5173 -sTCP:LISTEN`, welche Ports belegt sind (ein fremder Vite-Prozess auf 5173 lässt das Frontend auf 5174 ausweichen – das ist in Ordnung).

Run (im Hintergrund): `npm run dev`
Expected im Log: `Backend on :3000` und `VITE ... Local: http://localhost:517x/`.

- [ ] **Step 3: API-Smoke-Test mit curl**

```bash
curl -s http://localhost:3000/tickets | head -c 300; echo
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tickets/T-999
curl -s -X POST -H 'Content-Type: application/json' -d '{"title":"Smoke","description":"Test"}' http://localhost:3000/tickets
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{"model":"m"}' http://localhost:3000/tickets/T-1/refine
```
Expected: Liste mit `"id":"T-1"` …; `404`; Ticket-JSON mit `"id":"T-4"` (bzw. nächster freier Nummer); `400`.

- [ ] **Step 4: UI-Smoke-Test**

Frontend-URL im Browser (oder headless Chrome Screenshot) öffnen: Ticket-Liste sichtbar, Ticket öffnen zeigt Detail, „Neues Ticket“ legt ein Ticket an, „Reset“ stellt die drei Seeds wieder her. Einen echten Agent-Lauf **nur nach Rückfrage beim Nutzer** starten (verbraucht Tokens).

- [ ] **Step 5: Dev-Server stoppen und Stand festhalten**

Dev-Server beenden. Falls `npm install` den Lockfile verändert hat:

```bash
git status --short
git add package-lock.json && git commit -m "chore: Lockfile nach Kern-Extraktion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Teil 1 ist abgeschlossen, wenn Step 1–4 erfüllt sind. Weiter mit `2026-10-28-nextjs-hexagonal-2-web.md`.
