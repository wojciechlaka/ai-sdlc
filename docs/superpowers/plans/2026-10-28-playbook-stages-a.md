# Playbook-Stufen Teil A (Stufe 1 Ende zu Ende) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App liest Tickets aus `examples/tickets/*.md`, lässt den Intent-Agent `docs/work/<KEY>/intent.md` erzeugen, legt dafür Branch und PR im Ziel-Repo an und erkennt den Merge als Übergang in Stufe 2 (Design).

**Architecture:** Der Fachkern (`packages/core`, Ports & Adapters) bekommt ein neues Modell: Ticket mit Schlüssel, Stufe und Zustand; Artefakte (Datei, Branch, PR) und ein Log pro Ticket in SQLite. Neue Ports `TicketSource` (Markdown-Dateien) und `CodeHost` (GitHub über Octokit). Use Cases `startup`, `startStage`, `answerQuestion`, `stopRun`, `syncReviews`, `resetSystem`, `listTickets`, `getTicket`, `getSettings`. Die Next.js-App zeigt ein Board nach Stufen und eine Ticketseite mit Stufen, Inhalt (live vom Default-Branch), Log und genau einer Aktion je Zustand.

**Tech Stack:** TypeScript, Next.js 16 (App Router), React 19, Zod v4, Drizzle + better-sqlite3, `@octokit/rest` v22, Vitest 4, Claude CLI.

**Spec:** [`docs/superpowers/specs/2026-10-28-playbook-stages-design.md`](../specs/2026-10-28-playbook-stages-design.md) — Teil A aus §10.

---

## Vorab: Rahmen für alle Tasks

- **Branch:** `feature/playbook-stages` (existiert, enthält das Spec). Nicht auf `main` arbeiten.
- **Zwischenstand rot:** Das Modell ändert sich komplett. Ab Task 1 sind `npm run build` und `npm test` für `packages/core` bis Task 19 und für `apps/web` bis Task 22 rot. Jeder Task prüft deshalb nur **seine** Testdateien mit `npx vitest run <pfad>` im jeweiligen Paket. Task 19 macht den Kern grün (Test, Typprüfung, Lint), Task 22 die Web-App, Task 24 prüft alles zusammen.
- **Commits:** nach jedem Task, Nachricht auf Deutsch im Stil `feat(core): …`, mit Trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Sprache:** Code und Code-Kommentare Englisch (wie im Bestand), Texte für Nutzer Deutsch.
- **Fehler aus dem Kern** werden in Next.js über `errorCode(err)` erkannt, nie über `instanceof` (siehe `packages/core/src/domain/errors.ts`). Innerhalb des Kerns ist `instanceof` für Port-Fehler (`AgentRunTerminatedError`, `CodeHostError`) wie bisher erlaubt.
- **Abgrenzung zu Teil B:** Teil A entfernt das alte Refine (Status `backlog/refining/review`, Seeds, „Neues Ticket“, „Löschen“, Repo-Eingabe), weil das neue Modell es ersetzt. Stufe 2 (Design) ist im Modell vorhanden, aber noch nicht startbar (`STARTABLE_STAGES = ['plan']`). `refinementSchema.ts` und `skills/refinement-agent.md` bleiben für Teil B liegen. Doku außer README und `examples/tickets/README.md` folgt in Teil B.

## Dateien

**packages/shared/src**

| Datei | Aktion | Verantwortung |
|---|---|---|
| `stages.ts` | neu | `Stage`, `ArtifactStage`, `TicketState`, `PrState` |
| `intentSchema.ts` | neu | `IntentSchema`, Agent-Ausgabe Stufe 1, `StageOutputSchema` |
| `api.ts` | ersetzt | DTOs (`TicketDto`, `StageViewDto`, `AuditEventDto`, `TicketDetailDto`, `SettingsDto`), Inputs |
| `events.ts` | ersetzt | `TicketEvent` (progress, question, state) |
| `index.ts` | ersetzt | Exporte |
| `refinementSchema.ts` | bleibt | für Teil B |

**packages/core/src**

| Datei | Aktion | Verantwortung |
|---|---|---|
| `domain/types.ts` | ersetzt | Ticket, SourceTicket, AgentRun, Artifact |
| `domain/rules.ts` | ersetzt | Übergänge, Stufe aus dem Repo, Q&A-Verlauf |
| `domain/ticketKey.ts` | neu | Schlüssel-Muster, Sortierung CB-2 vor CB-10 |
| `domain/artifacts.ts` | neu | Pfad, Branch, Titel, Datei-URL, App-Branch erkennen |
| `domain/render.ts` | neu | `renderIntent`, `renderPullRequestBody` |
| `domain/ticketId.ts`, `domain/seeds.ts` (+Tests) | löschen | ersetzt durch Schlüssel und Ticket-Dateien |
| `ports/*.ts` | ersetzt/neu | `TicketRepository`, `AgentRunRepository`, `ArtifactRepository`, `AuditLog`, `TicketSource`, `CodeHost`, `AgentRunner`, `EventPublisher` |
| `adapters/sqlite/*` | ersetzt | neues Schema, neue Migration, Repositories |
| `adapters/markdownTickets/markdownTicketSource.ts` | neu | liest `examples/tickets/*.md` |
| `adapters/github/githubCodeHost.ts` | neu | Octokit-REST |
| `adapters/claudeCli/*` | geändert | Agent je Stufe (Skill + Schema), Prompt ohne alte Felder |
| `adapters/nodeEvents/nodeEventPublisher.ts` | geändert | Abo für alle Tickets (`null`) |
| `application/deps.ts`, `reporter.ts`, `requireTicket.ts`, `dto.ts`, `queries.ts` | ersetzt | |
| `application/messages.ts`, `describeError.ts`, `failStage.ts` | neu | gemeinsame Texte und Hilfen |
| `application/stageCommands.ts` | neu | `startStage`, `answerQuestion`, `stopRun` |
| `application/runStage.ts`, `executeRun.ts`, `publishArtifact.ts` | neu/ersetzt | Hintergrund-Job einer Stufe |
| `application/syncReviews.ts` | neu | PR-Status abgleichen |
| `application/startup.ts` | ersetzt | Start-Ablauf, `resetSystem` |
| `application/commands.ts`, `refinementJobs.ts` (+Tests) | löschen | |
| `application/createUseCases.ts`, `compose.ts`, `index.ts` | ersetzt | |
| `testing/fakes.ts` | ersetzt | In-Memory-Repos, `FakeCodeHost`, `FakeTicketSource`, `FakeAgentRunner` |
| `skills/intent-agent.md` | neu | Skill Stufe 1 |

**apps/web**

| Datei | Aktion |
|---|---|
| `lib/container.ts`, `instrumentation.ts`, `app/actions.ts`, `app/api/events/route.ts`, `hooks/useSSE.ts`, `lib/constants.ts` | geändert |
| `lib/logFormat.ts` | neu — Log-Zeilen und Kosten |
| `app/page.tsx`, `components/Board.tsx`, `components/BoardLive.tsx`, `components/TicketCard.tsx` | neu/ersetzt — Board |
| `app/tickets/[key]/…` (statt `[id]`), `components/TicketDetail.tsx`, `StagePanel.tsx`, `TicketActions.tsx`, `LogList.tsx` | neu/ersetzt — Ticketseite |
| `components/Sidebar.tsx`, `ResetButton.tsx`, `QuestionPanel.tsx`, `AppStateProvider.tsx`, `app/layout.tsx` | geändert |
| `CreateTicketDialog*`, `RepoSettings`, `TicketList`, `TicketLive*`, `TicketMetaRow`, `PlanSection` | löschen |

**Repo-Wurzel:** `README.md`, `examples/tickets/README.md`.

---

## Task 1: Verträge in `packages/shared`

**Files:**
- Create: `packages/shared/src/stages.ts`, `packages/shared/src/intentSchema.ts`, `packages/shared/src/intentSchema.test.ts`
- Replace: `packages/shared/src/api.ts`, `packages/shared/src/api.test.ts`, `packages/shared/src/events.ts`, `packages/shared/src/events.test.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Tests schreiben**

`packages/shared/src/intentSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { IntentAgentOutputSchema, IntentSchema } from './intentSchema'

const INTENT = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine Lesezeit in Minuten.',
  affected: ['Leser', 'Artikel-API'],
  openPoints: [{ question: 'Wörter pro Minute?' }],
}

describe('IntentSchema', () => {
  it('accepts a complete intent', () => {
    expect(IntentSchema.parse(INTENT)).toEqual(INTENT)
  })

  it('rejects titles longer than 60 characters', () => {
    expect(IntentSchema.safeParse({ ...INTENT, title: 'x'.repeat(61) }).success).toBe(false)
  })
})

describe('IntentAgentOutputSchema', () => {
  it('accepts a question', () => {
    expect(IntentAgentOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
  })

  it('accepts an intent result', () => {
    expect(IntentAgentOutputSchema.parse({ type: 'intent', result: INTENT }).type).toBe('intent')
  })

  it('rejects the old refinement output', () => {
    expect(IntentAgentOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
```

`packages/shared/src/api.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect } from 'vitest'
import { AnswerInput, StartStageInput, TicketDetailSchema, TicketSchema } from './api'

const NOW = new Date('2026-10-28T10:00:00Z')

const TICKET = {
  key: 'CB-2',
  title: 'Lesezeit bei Artikeln anzeigen',
  description: 'Leser möchten vorher sehen, wie lange ein Artikel dauert.',
  priority: 'Mittel',
  sourcePath: 'examples/tickets/cb-2-lesezeit.md',
  stage: 'plan' as const,
  state: 'ready' as const,
  openPr: null,
  updatedAt: NOW,
}

describe('TicketSchema', () => {
  it('accepts a ticket with a KEY-n key', () => {
    expect(TicketSchema.parse(TICKET)).toEqual(TICKET)
  })

  it('rejects keys that are not upper-case KEY-n', () => {
    expect(TicketSchema.safeParse({ ...TICKET, key: 'cb-2' }).success).toBe(false)
    expect(TicketSchema.safeParse({ ...TICKET, key: 'CB2' }).success).toBe(false)
  })

  it('rejects unknown stages and states', () => {
    expect(TicketSchema.safeParse({ ...TICKET, stage: 'build' }).success).toBe(false)
    expect(TicketSchema.safeParse({ ...TICKET, state: 'refining' }).success).toBe(false)
  })
})

describe('TicketDetailSchema', () => {
  it('accepts stages, log and a pending question', () => {
    const detail = TicketDetailSchema.parse({
      ...TICKET,
      state: 'awaiting_answer',
      stages: [{
        stage: 'plan', path: 'docs/work/CB-2/intent.md',
        fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-2/intent.md',
        completed: false, pr: null, mergedAt: null, content: null,
      }],
      log: [{ actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' }, createdAt: NOW }],
      pendingQuestion: 'Wer?',
    })
    expect(detail.pendingQuestion).toBe('Wer?')
    expect(detail.stages[0]?.stage).toBe('plan')
  })
})

describe('inputs', () => {
  it('StartStageInput requires a model', () => {
    expect(StartStageInput.safeParse({ model: ' ' }).success).toBe(false)
    expect(StartStageInput.parse({ model: 'claude-sonnet-4-6' })).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('AnswerInput rejects blank answers', () => {
    expect(AnswerInput.safeParse({ answer: '  ' }).success).toBe(false)
  })
})
```

`packages/shared/src/events.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect } from 'vitest'
import { TicketEventSchema } from './events'

describe('TicketEventSchema', () => {
  it('accepts progress, question and state events', () => {
    expect(TicketEventSchema.parse({ type: 'progress', ticketKey: 'CB-1', message: 'm' }).type).toBe('progress')
    expect(TicketEventSchema.parse({ type: 'question', ticketKey: 'CB-1', question: 'q' }).type).toBe('question')
    expect(TicketEventSchema.parse({ type: 'state', ticketKey: 'CB-1', stage: 'design', state: 'ready' }).type).toBe('state')
  })

  it('rejects the old status event', () => {
    expect(TicketEventSchema.safeParse({ type: 'status', ticketId: 'T-1', status: 'review' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

Run: `cd packages/shared && npx vitest run`
Expected: FAIL (`intentSchema`, `StartStageInput`, `TicketEventSchema` fehlen).

- [ ] **Step 3: Verträge schreiben**

`packages/shared/src/stages.ts`:

```ts
import { z } from 'zod'

/** Playbook stage of a ticket. `done` = every showcase stage is merged. */
export const StageSchema = z.enum(['plan', 'design', 'done'])
export type Stage = z.infer<typeof StageSchema>

/** Stages that produce an artifact (file + branch + PR). */
export const ArtifactStageSchema = z.enum(['plan', 'design'])
export type ArtifactStage = z.infer<typeof ArtifactStageSchema>

/** Where a ticket stands inside its current stage. */
export const TicketStateSchema = z.enum(['ready', 'running', 'awaiting_answer', 'in_review', 'failed'])
export type TicketState = z.infer<typeof TicketStateSchema>

export const PrStateSchema = z.enum(['open', 'merged', 'closed'])
export type PrState = z.infer<typeof PrStateSchema>
```

`packages/shared/src/intentSchema.ts`:

```ts
import { z } from 'zod'
import { QuestionOutputSchema } from './refinementSchema'

/** Result of stage 1 (Plan): what the problem is, not how to solve it. */
export const IntentSchema = z.object({
  title: z.string().max(60),
  problem: z.string(),
  desiredOutcome: z.string(),
  affected: z.array(z.string()),
  openPoints: z.array(z.object({ question: z.string() })),
})
export type Intent = z.infer<typeof IntentSchema>

/** Agent output of stage 1: a blocking question or the intent. */
export const IntentAgentOutputSchema = z.discriminatedUnion('type', [
  QuestionOutputSchema,
  z.object({ type: z.literal('intent'), result: IntentSchema }),
])
export type IntentAgentOutput = z.infer<typeof IntentAgentOutputSchema>

/** Everything an agent run may return, across all stages. Part B adds the spec output of stage 2. */
export const StageOutputSchema = IntentAgentOutputSchema
export type StageOutput = IntentAgentOutput
```

`packages/shared/src/api.ts` (ersetzt die Datei):

```ts
import { z } from 'zod'
import { ArtifactStageSchema, PrStateSchema, StageSchema, TicketStateSchema } from './stages'

const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)

export const PullRequestRefSchema = z.object({
  number: z.number().int(),
  url: z.string(),
  state: PrStateSchema,
})
export type PullRequestRefDto = z.infer<typeof PullRequestRefSchema>

export const TicketSchema = z.object({
  /** Ticket key from the source file, e.g. `CB-3`. */
  key: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
  title: z.string(),
  description: z.string(),
  priority: z.string().nullable(),
  /** Source file relative to the repository root, e.g. `examples/tickets/cb-3-kommentare-melden.md`. */
  sourcePath: z.string(),
  stage: StageSchema,
  state: TicketStateSchema,
  /** PR of the current stage while the ticket is `in_review`. */
  openPr: PullRequestRefSchema.nullable(),
  updatedAt: z.date(),
})
export type TicketDto = z.infer<typeof TicketSchema>

export const StageViewSchema = z.object({
  stage: ArtifactStageSchema,
  /** Artifact path in the target repository, e.g. `docs/work/CB-3/intent.md`. */
  path: z.string(),
  /** Link to the file on the default branch. */
  fileUrl: z.string(),
  /** True once the artifact is merged and the ticket moved on. */
  completed: z.boolean(),
  /** Latest PR the app opened for this stage. */
  pr: PullRequestRefSchema.nullable(),
  mergedAt: z.date().nullable(),
  /** File content read live from the default branch; null if not merged or not readable. */
  content: z.string().nullable(),
})
export type StageViewDto = z.infer<typeof StageViewSchema>

export const AuditActorSchema = z.enum(['human', 'agent', 'system'])

export const AuditEventSchema = z.object({
  actor: AuditActorSchema,
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.date(),
})
export type AuditEventDto = z.infer<typeof AuditEventSchema>

export const TicketDetailSchema = TicketSchema.extend({
  stages: z.array(StageViewSchema),
  log: z.array(AuditEventSchema),
  /** Question of the agent while the ticket is `awaiting_answer`. */
  pendingQuestion: z.string().nullable(),
})
export type TicketDetailDto = z.infer<typeof TicketDetailSchema>

export const SettingsSchema = z.object({
  /** `TARGET_REPO` */
  repoUrl: z.string(),
  /** False without `GITHUB_TOKEN`: stages cannot be started. */
  tokenConfigured: z.boolean(),
})
export type SettingsDto = z.infer<typeof SettingsSchema>

export const StartStageInput = z.object({
  model: notBlank('Modell ist erforderlich'),
})
export type StartStageInput = z.infer<typeof StartStageInput>

export const AnswerInput = z.object({
  answer: notBlank('Antwort ist erforderlich'),
})
export type AnswerInput = z.infer<typeof AnswerInput>
```

`packages/shared/src/events.ts` (ersetzt die Datei):

```ts
import { z } from 'zod'
import { StageSchema, TicketStateSchema } from './stages'

/** Live events from the core to open browser tabs (SSE). */
export const TicketEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), ticketKey: z.string(), message: z.string() }),
  z.object({ type: z.literal('question'), ticketKey: z.string(), question: z.string() }),
  z.object({ type: z.literal('state'), ticketKey: z.string(), stage: StageSchema, state: TicketStateSchema }),
])
export type TicketEvent = z.infer<typeof TicketEventSchema>
```

`packages/shared/src/index.ts` (ersetzt die Datei):

```ts
export { RefinementOutputSchema, AgentOutputSchema, QuestionOutputSchema } from './refinementSchema'
export type { RefinementOutput, AgentOutput } from './refinementSchema'
export { StageSchema, ArtifactStageSchema, TicketStateSchema, PrStateSchema } from './stages'
export type { Stage, ArtifactStage, TicketState, PrState } from './stages'
export { IntentSchema, IntentAgentOutputSchema, StageOutputSchema } from './intentSchema'
export type { Intent, IntentAgentOutput, StageOutput } from './intentSchema'
export {
  PullRequestRefSchema,
  TicketSchema,
  StageViewSchema,
  AuditActorSchema,
  AuditEventSchema,
  TicketDetailSchema,
  SettingsSchema,
  StartStageInput,
  AnswerInput,
} from './api'
export type { PullRequestRefDto, TicketDto, StageViewDto, AuditEventDto, TicketDetailDto, SettingsDto } from './api'
export { TicketEventSchema } from './events'
export type { TicketEvent } from './events'
```

- [ ] **Step 4: Tests und Typprüfung grün**

Run: `cd packages/shared && npx vitest run && npx tsc --noEmit`
Expected: alle Tests PASS, keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): Verträge für Stufe, Zustand, Intent und Ticket-Events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Domäne — Typen und Regeln

**Files:**
- Replace: `packages/core/src/domain/types.ts`, `packages/core/src/domain/rules.ts`, `packages/core/src/domain/rules.test.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/domain/rules.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect } from 'vitest'
import type { AgentRun, Ticket } from './types'
import {
  canAnswer,
  canStartStage,
  canStop,
  currentArtifactStage,
  isStageCompleted,
  nextStage,
  planAnswerRun,
  reconcile,
  stageFromRepo,
} from './rules'

const NOW = new Date('2026-10-28T10:00:00Z')

function ticket(patch: Partial<Ticket> = {}): Ticket {
  return {
    key: 'CB-1', title: 'T', description: 'D', priority: null, sourcePath: 'examples/tickets/cb-1.md',
    stage: 'plan', state: 'ready', createdAt: NOW, updatedAt: NOW, ...patch,
  }
}

function run(patch: Partial<AgentRun>): AgentRun {
  return {
    id: 'r', ticketKey: 'CB-1', stage: 'plan', seq: 1, trigger: 'initial',
    input: { model: 'm', previousRuns: [] }, output: null, status: 'succeeded', model: 'm',
    costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null,
    startedAt: NOW, finishedAt: NOW, ...patch,
  }
}

describe('canStartStage', () => {
  it('allows plan from ready and failed', () => {
    expect(canStartStage(ticket({ state: 'ready' }))).toBe(true)
    expect(canStartStage(ticket({ state: 'failed' }))).toBe(true)
  })

  it('rejects every other state', () => {
    for (const state of ['running', 'awaiting_answer', 'in_review'] as const) {
      expect(canStartStage(ticket({ state }))).toBe(false)
    }
  })

  it('rejects design until part B and done always', () => {
    expect(canStartStage(ticket({ stage: 'design' }))).toBe(false)
    expect(canStartStage(ticket({ stage: 'done' }))).toBe(false)
  })
})

describe('canAnswer / canStop', () => {
  it('answers only while awaiting an answer', () => {
    expect(canAnswer(ticket({ state: 'awaiting_answer' }))).toBe(true)
    expect(canAnswer(ticket({ state: 'running' }))).toBe(false)
  })

  it('stops running and waiting tickets', () => {
    expect(canStop(ticket({ state: 'running' }))).toBe(true)
    expect(canStop(ticket({ state: 'awaiting_answer' }))).toBe(true)
    expect(canStop(ticket({ state: 'in_review' }))).toBe(false)
  })
})

describe('stages', () => {
  it('maps the current stage to its artifact stage', () => {
    expect(currentArtifactStage(ticket({ stage: 'plan' }))).toBe('plan')
    expect(currentArtifactStage(ticket({ stage: 'done' }))).toBeNull()
  })

  it('moves plan → design → done', () => {
    expect(nextStage('plan')).toBe('design')
    expect(nextStage('design')).toBe('done')
  })

  it('knows which stages are completed', () => {
    expect(isStageCompleted(ticket({ stage: 'plan' }), 'plan')).toBe(false)
    expect(isStageCompleted(ticket({ stage: 'design' }), 'plan')).toBe(true)
    expect(isStageCompleted(ticket({ stage: 'design' }), 'design')).toBe(false)
    expect(isStageCompleted(ticket({ stage: 'done' }), 'design')).toBe(true)
  })

  it('derives the stage from the files on the default branch', () => {
    expect(stageFromRepo({ hasIntent: false, hasSpec: false })).toBe('plan')
    expect(stageFromRepo({ hasIntent: true, hasSpec: false })).toBe('design')
    expect(stageFromRepo({ hasIntent: true, hasSpec: true })).toBe('done')
  })
})

describe('reconcile', () => {
  it('resets to ready when the repo shows another stage', () => {
    expect(reconcile(ticket({ stage: 'plan', state: 'failed' }), 'design')).toEqual({ stage: 'design', state: 'ready' })
  })

  it('turns in_review into ready because the start-up closed all app PRs', () => {
    expect(reconcile(ticket({ state: 'in_review' }), 'plan')).toEqual({ stage: 'plan', state: 'ready' })
  })

  it('keeps a pending question across restarts', () => {
    expect(reconcile(ticket({ state: 'awaiting_answer' }), 'plan')).toEqual({ stage: 'plan', state: 'awaiting_answer' })
  })
})

describe('planAnswerRun', () => {
  it('returns null without a question', () => {
    expect(planAnswerRun([run({ output: null })], 'a')).toBeNull()
  })

  it('appends the answer to the history of the question run', () => {
    const first = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const second = run({
      id: 'r2', seq: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
      input: { model: 'm', previousRuns: [{ question: 'Q1', answer: 'A1' }] },
    })
    const plan = planAnswerRun([first, second], 'A2')
    expect(plan?.questionRun.id).toBe('r2')
    expect(plan?.previousRuns).toEqual([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }])
  })

  it('ignores a question that was followed by a later run', () => {
    const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
    const failed = run({ id: 'r2', seq: 2, output: null, status: 'failed' })
    expect(planAnswerRun([asked, failed], 'a')).toBeNull()
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/domain/rules.test.ts`
Expected: FAIL (Funktionen fehlen).

- [ ] **Step 3: Implementieren**

`packages/core/src/domain/types.ts` (ersetzt die Datei):

```ts
import type { ArtifactStage, PrState, Stage, StageOutput, TicketState } from '@refinement/shared'

export type { ArtifactStage, PrState, Stage, StageOutput, TicketState }

export interface QAPair {
  question: string
  answer: string
}

export type RunTrigger = 'initial' | 'answer'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'timeout'

/** One ticket as the ticket source (simulated Jira) delivers it. */
export interface SourceTicket {
  key: string
  title: string
  description: string
  priority: string | null
  /** Relative to the repository root, `/`-separated. */
  sourcePath: string
}

export interface Ticket extends SourceTicket {
  stage: Stage
  state: TicketState
  createdAt: Date
  updatedAt: Date
}

/** Snapshot of what a run was started with; the answer run continues from it. */
export interface AgentRunInput {
  model: string
  previousRuns: QAPair[]
}

export interface AgentRun {
  id: string
  ticketKey: string
  stage: ArtifactStage
  /** Running number per ticket, starting at 1. */
  seq: number
  trigger: RunTrigger
  input: AgentRunInput
  output: StageOutput | null
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

/** A file the app proposed via branch + PR. The content lives in Git, not here. */
export interface Artifact {
  id: string
  ticketKey: string
  stage: ArtifactStage
  path: string
  branch: string
  prNumber: number
  prUrl: string
  prState: PrState
  mergedAt: Date | null
  createdAt: Date
}
```

`packages/core/src/domain/rules.ts` (ersetzt die Datei):

```ts
import type { AgentRun, ArtifactStage, QAPair, Stage, Ticket, TicketState } from './types'

/** Stages that can be started in this version. Part B adds 'design'. */
export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan']

const STAGE_ORDER: readonly Stage[] = ['plan', 'design', 'done']

/** The artifact stage the ticket is in; null once it is `done`. */
export function currentArtifactStage(ticket: Pick<Ticket, 'stage'>): ArtifactStage | null {
  return ticket.stage === 'done' ? null : ticket.stage
}

/** A stage starts from `ready` or after a failure. */
export function canStartStage(ticket: Pick<Ticket, 'stage' | 'state'>): boolean {
  const stage = currentArtifactStage(ticket)
  return stage !== null && STARTABLE_STAGES.includes(stage) && (ticket.state === 'ready' || ticket.state === 'failed')
}

export function canAnswer(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'awaiting_answer'
}

export function canStop(ticket: Pick<Ticket, 'state'>): boolean {
  return ticket.state === 'running' || ticket.state === 'awaiting_answer'
}

/** Stage after a merged artifact. */
export function nextStage(stage: ArtifactStage): Stage {
  return stage === 'plan' ? 'design' : 'done'
}

/** True once the ticket moved past `stage`, i.e. its artifact is merged. */
export function isStageCompleted(ticket: Pick<Ticket, 'stage'>, stage: ArtifactStage): boolean {
  return STAGE_ORDER.indexOf(ticket.stage) > STAGE_ORDER.indexOf(stage)
}

/** Stage implied by the artifacts found on the default branch. */
export function stageFromRepo(files: { hasIntent: boolean; hasSpec: boolean }): Stage {
  if (files.hasSpec) return 'done'
  if (files.hasIntent) return 'design'
  return 'plan'
}

/**
 * Applies the stage found on the default branch after the start-up cleanup.
 * A changed stage starts over as `ready`; `in_review` becomes `ready` because the start-up closed
 * every open PR of the app; other states (e.g. `awaiting_answer`) survive a restart.
 */
export function reconcile(ticket: Pick<Ticket, 'stage' | 'state'>, repoStage: Stage): { stage: Stage; state: TicketState } {
  if (repoStage !== ticket.stage) return { stage: repoStage, state: 'ready' }
  if (ticket.state === 'in_review') return { stage: ticket.stage, state: 'ready' }
  return { stage: ticket.stage, state: ticket.state }
}

/**
 * Finds the open question and builds the Q&A history for the answer run.
 * Only the latest run counts: a question followed by another run is no longer open.
 * @param runs   - Runs of one ticket and stage in `seq` order.
 * @param answer - The human's answer to the open question.
 */
export function planAnswerRun(
  runs: AgentRun[],
  answer: string,
): { questionRun: AgentRun; previousRuns: QAPair[] } | null {
  const latest = runs[runs.length - 1]
  const output = latest?.output
  if (!latest || output?.type !== 'question') return null
  return { questionRun: latest, previousRuns: [...latest.input.previousRuns, { question: output.question, answer }] }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/domain/rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/types.ts packages/core/src/domain/rules.ts packages/core/src/domain/rules.test.ts
git commit -m "feat(core): Domänentypen und Übergänge für Stufe und Zustand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Domäne — Schlüssel und Artefakt-Namen

**Files:**
- Create: `packages/core/src/domain/ticketKey.ts`, `packages/core/src/domain/artifacts.ts`, `packages/core/src/domain/artifacts.test.ts`
- Delete: `packages/core/src/domain/ticketId.ts`, `packages/core/src/domain/ticketId.test.ts`, `packages/core/src/domain/seeds.ts`, `packages/core/src/domain/seeds.test.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/domain/artifacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { artifactPath, artifactTitle, branchName, fileUrl, parseAppBranch } from './artifacts'
import { compareTicketKeys, isTicketKey } from './ticketKey'

describe('ticket keys', () => {
  it('accepts KEY-n keys only', () => {
    expect(isTicketKey('CB-3')).toBe(true)
    expect(isTicketKey('cb-3')).toBe(false)
    expect(isTicketKey('CB3')).toBe(false)
  })

  it('sorts by prefix, then numerically', () => {
    expect(['CB-10', 'AB-1', 'CB-2'].sort(compareTicketKeys)).toEqual(['AB-1', 'CB-2', 'CB-10'])
  })
})

describe('artifact names', () => {
  it('builds path, branch and title per stage', () => {
    expect(artifactPath('CB-3', 'plan')).toBe('docs/work/CB-3/intent.md')
    expect(artifactPath('CB-3', 'design')).toBe('docs/work/CB-3/spec.md')
    expect(branchName('CB-3', 'plan')).toBe('CB-3/intent')
    expect(branchName('CB-3', 'design')).toBe('CB-3/spec')
    expect(artifactTitle('CB-3', 'plan')).toBe('CB-3: Intent')
    expect(artifactTitle('CB-3', 'design')).toBe('CB-3: Spec')
  })

  it('links the file on the default branch', () => {
    expect(fileUrl('https://github.com/o/r', 'docs/work/CB-3/intent.md'))
      .toBe('https://github.com/o/r/blob/HEAD/docs/work/CB-3/intent.md')
    expect(fileUrl('https://github.com/o/r.git/', 'a.md')).toBe('https://github.com/o/r/blob/HEAD/a.md')
  })
})

describe('parseAppBranch', () => {
  const known = new Set(['CB-1', 'CB-3'])

  it('recognises branches of known tickets', () => {
    expect(parseAppBranch('CB-3/intent', known)).toEqual({ key: 'CB-3', stage: 'plan' })
    expect(parseAppBranch('CB-1/spec', known)).toEqual({ key: 'CB-1', stage: 'design' })
  })

  it('ignores unknown tickets and foreign branches', () => {
    expect(parseAppBranch('CB-9/intent', known)).toBeNull()
    expect(parseAppBranch('feature/CB-3', known)).toBeNull()
    expect(parseAppBranch('CB-3/intent-old', known)).toBeNull()
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/domain/artifacts.test.ts`
Expected: FAIL (Module fehlen).

- [ ] **Step 3: Implementieren**

`packages/core/src/domain/ticketKey.ts`:

```ts
/** Ticket keys as in Jira: upper-case prefix, dash, number (`CB-3`). */
export const TICKET_KEY_PATTERN = '[A-Z][A-Z0-9]*-\\d+'

const KEY_RE = /^([A-Z][A-Z0-9]*)-(\d+)$/

export function isTicketKey(value: string): boolean {
  return KEY_RE.test(value)
}

/** Orders by prefix, then by number, so CB-2 comes before CB-10. */
export function compareTicketKeys(a: string, b: string): number {
  const ma = KEY_RE.exec(a)
  const mb = KEY_RE.exec(b)
  if (!ma || !mb) return a.localeCompare(b)
  return ma[1]!.localeCompare(mb[1]!) || Number(ma[2]) - Number(mb[2])
}
```

`packages/core/src/domain/artifacts.ts`:

```ts
import type { ArtifactStage } from './types'
import { TICKET_KEY_PATTERN } from './ticketKey'

const FILE_NAME: Record<ArtifactStage, string> = { plan: 'intent', design: 'spec' }
const LABEL: Record<ArtifactStage, string> = { plan: 'Intent', design: 'Spec' }
const APP_BRANCH_RE = new RegExp(`^(${TICKET_KEY_PATTERN})/(intent|spec)$`)

/** `docs/work/CB-3/intent.md` */
export function artifactPath(key: string, stage: ArtifactStage): string {
  return `docs/work/${key}/${FILE_NAME[stage]}.md`
}

/** `CB-3/intent` — one branch per ticket and stage. */
export function branchName(key: string, stage: ArtifactStage): string {
  return `${key}/${FILE_NAME[stage]}`
}

/** `CB-3: Intent` — PR title and commit message. */
export function artifactTitle(key: string, stage: ArtifactStage): string {
  return `${key}: ${LABEL[stage]}`
}

/** Link to a file on the default branch (`HEAD` resolves to it on GitHub). */
export function fileUrl(repoUrl: string, path: string): string {
  const base = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  return `${base}/blob/HEAD/${path}`
}

/** Recognises a branch the app created for one of the known tickets; null for every other branch. */
export function parseAppBranch(
  branch: string,
  knownKeys: ReadonlySet<string>,
): { key: string; stage: ArtifactStage } | null {
  const match = APP_BRANCH_RE.exec(branch)
  if (!match || !knownKeys.has(match[1]!)) return null
  return { key: match[1]!, stage: match[2] === 'intent' ? 'plan' : 'design' }
}
```

Dann die alten Dateien löschen:

```bash
git rm packages/core/src/domain/ticketId.ts packages/core/src/domain/ticketId.test.ts \
       packages/core/src/domain/seeds.ts packages/core/src/domain/seeds.test.ts
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/domain/artifacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain
git commit -m "feat(core): Ticket-Schlüssel und Namen für Artefakte, Branches und PRs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Domäne — Markdown für Intent und PR

**Files:**
- Create: `packages/core/src/domain/render.ts`, `packages/core/src/domain/render.test.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/domain/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Intent } from '@refinement/shared'
import { renderIntent, renderPullRequestBody } from './render'

const TICKET = { key: 'CB-2', title: 'Lesezeit bei Artikeln anzeigen', sourcePath: 'examples/tickets/cb-2-lesezeit.md' }

const INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.\n',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit in Minuten.',
  affected: ['Leser', 'Artikel-API'],
  openPoints: [{ question: 'Wie viele Wörter pro Minute?' }],
}

describe('renderIntent', () => {
  it('renders front matter and all sections', () => {
    expect(renderIntent(TICKET, INTENT, [{ question: 'Gilt das auch für Entwürfe?', answer: 'Nein.' }])).toBe(
      [
        '---',
        'ticket: CB-2',
        'stage: plan',
        'source: examples/tickets/cb-2-lesezeit.md',
        '---',
        '',
        '# CB-2: Lesezeit anzeigen',
        '',
        '## Problem',
        '',
        'Leser wissen nicht, wie lange ein Artikel dauert.',
        '',
        '## Gewünschtes Ergebnis',
        '',
        'Die Artikel-API liefert eine geschätzte Lesezeit in Minuten.',
        '',
        '## Betroffene',
        '',
        '- Leser',
        '- Artikel-API',
        '',
        '## Offene Punkte',
        '',
        '- Wie viele Wörter pro Minute?',
        '',
        '## Geklärte Rückfragen',
        '',
        '**F:** Gilt das auch für Entwürfe?',
        '**A:** Nein.',
        '',
      ].join('\n'),
    )
  })

  it('writes "Keine." for empty lists', () => {
    const md = renderIntent(TICKET, { ...INTENT, affected: [], openPoints: [] }, [])
    expect(md).toContain('## Betroffene\n\nKeine.\n')
    expect(md).toContain('## Offene Punkte\n\nKeine.\n')
    expect(md).toContain('## Geklärte Rückfragen\n\nKeine.\n')
  })
})

describe('renderPullRequestBody', () => {
  it('names the artifact, summarises it and explains the gate', () => {
    expect(renderPullRequestBody(TICKET, 'plan', 'Leser wissen nicht, wie lange ein Artikel dauert.')).toBe(
      [
        '**CB-2: Intent** für „Lesezeit bei Artikeln anzeigen“',
        '',
        'Leser wissen nicht, wie lange ein Artikel dauert.',
        '',
        'Quelle: `examples/tickets/cb-2-lesezeit.md`',
        '',
        '---',
        'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
      ].join('\n'),
    )
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/domain/render.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `packages/core/src/domain/render.ts`:

```ts
import type { Intent } from '@refinement/shared'
import type { ArtifactStage, QAPair, Ticket } from './types'
import { artifactTitle } from './artifacts'

const NONE = 'Keine.'

function bulletList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : NONE
}

function answeredQuestions(pairs: QAPair[]): string {
  return pairs.length ? pairs.map((p) => `**F:** ${p.question}\n**A:** ${p.answer}`).join('\n\n') : NONE
}

/**
 * Markdown of `docs/work/<KEY>/intent.md`. The front matter identifies the ticket only;
 * state stays in the platform database.
 */
export function renderIntent(ticket: Pick<Ticket, 'key' | 'sourcePath'>, intent: Intent, answered: QAPair[]): string {
  return [
    '---',
    `ticket: ${ticket.key}`,
    'stage: plan',
    `source: ${ticket.sourcePath}`,
    '---',
    '',
    `# ${ticket.key}: ${intent.title}`,
    '',
    '## Problem',
    '',
    intent.problem.trim(),
    '',
    '## Gewünschtes Ergebnis',
    '',
    intent.desiredOutcome.trim(),
    '',
    '## Betroffene',
    '',
    bulletList(intent.affected),
    '',
    '## Offene Punkte',
    '',
    bulletList(intent.openPoints.map((p) => p.question)),
    '',
    '## Geklärte Rückfragen',
    '',
    answeredQuestions(answered),
    '',
  ].join('\n')
}

/** Description of the stage PR: what it contains and that the merge is the gate. */
export function renderPullRequestBody(
  ticket: Pick<Ticket, 'key' | 'title' | 'sourcePath'>,
  stage: ArtifactStage,
  summary: string,
): string {
  return [
    `**${artifactTitle(ticket.key, stage)}** für „${ticket.title}“`,
    '',
    summary.trim(),
    '',
    `Quelle: \`${ticket.sourcePath}\``,
    '',
    '---',
    'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
  ].join('\n')
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/domain/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/render.ts packages/core/src/domain/render.test.ts
git commit -m "feat(core): Intent und PR-Text als Markdown rendern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Ports und Event-Bus für alle Tickets

**Files:**
- Replace: `packages/core/src/ports/ticketRepository.ts`, `agentRunRepository.ts`, `auditLog.ts`, `agentRunner.ts`, `eventPublisher.ts`, `index.ts`
- Create: `packages/core/src/ports/artifactRepository.ts`, `ticketSource.ts`, `codeHost.ts`
- Modify: `packages/core/src/adapters/nodeEvents/nodeEventPublisher.ts`, `nodeEventPublisher.test.ts`
- Unchanged: `packages/core/src/ports/repoProvider.ts`

- [ ] **Step 1: Test für den Event-Bus anpassen** — `packages/core/src/adapters/nodeEvents/nodeEventPublisher.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, vi } from 'vitest'
import { createNodeEventPublisher } from './nodeEventPublisher'

describe('createNodeEventPublisher', () => {
  it('delivers events only to subscribers of the same ticket', () => {
    const bus = createNodeEventPublisher()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.subscribe('CB-1', cb1)
    bus.subscribe('CB-2', cb2)

    bus.publish({ type: 'progress', ticketKey: 'CB-1', message: 'hi' })

    expect(cb1).toHaveBeenCalledWith({ type: 'progress', ticketKey: 'CB-1', message: 'hi' })
    expect(cb2).not.toHaveBeenCalled()
  })

  it('delivers every event to subscribers of all tickets (null)', () => {
    const bus = createNodeEventPublisher()
    const all = vi.fn()
    bus.subscribe(null, all)

    bus.publish({ type: 'state', ticketKey: 'CB-1', stage: 'plan', state: 'running' })
    bus.publish({ type: 'question', ticketKey: 'CB-2', question: 'q' })

    expect(all).toHaveBeenCalledTimes(2)
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createNodeEventPublisher()
    const one = vi.fn()
    const all = vi.fn()
    const unsubscribeOne = bus.subscribe('CB-1', one)
    const unsubscribeAll = bus.subscribe(null, all)

    unsubscribeOne()
    unsubscribeAll()
    bus.publish({ type: 'question', ticketKey: 'CB-1', question: 'q' })

    expect(one).not.toHaveBeenCalled()
    expect(all).not.toHaveBeenCalled()
  })

  it('does not warn about many listeners', () => {
    const bus = createNodeEventPublisher()
    const warn = vi.spyOn(process, 'emitWarning')
    for (let i = 0; i < 20; i++) bus.subscribe('CB-1', () => {})
    for (let i = 0; i < 20; i++) bus.subscribe(null, () => {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/nodeEvents`
Expected: FAIL (`subscribe(null, …)` liefert nichts).

- [ ] **Step 3: Ports schreiben**

`packages/core/src/ports/ticketRepository.ts`:

```ts
import type { SourceTicket, Stage, Ticket, TicketState } from '../domain/types'

export interface TicketRepository {
  /** All tickets ordered by key (CB-2 before CB-10). */
  list(): Ticket[]
  findByKey(key: string): Ticket | null
  /**
   * Inserts unknown tickets as `plan/ready`; updates title, description, priority and source path
   * of known ones and keeps their stage and state.
   * @returns The keys that were inserted.
   */
  upsertFromSource(items: readonly SourceTicket[]): string[]
  /** @throws if the ticket does not exist. */
  update(key: string, patch: { stage?: Stage; state?: TicketState }): Ticket
  /** Deletes all tickets with their runs, artifacts and log entries. */
  clear(): void
}
```

`packages/core/src/ports/agentRunRepository.ts`:

```ts
import type { StageOutput } from '@refinement/shared'
import type { AgentRun, AgentRunInput, ArtifactStage, RunTrigger } from '../domain/types'

export interface RunCompletion {
  output: StageOutput
  costUsd: number
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
}

export interface AgentRunRepository {
  /** Creates a `running` run with the next `seq` of its ticket. @throws if the ticket does not exist. */
  create(input: { ticketKey: string; stage: ArtifactStage; trigger: RunTrigger; input: AgentRunInput; model: string }): AgentRun
  findById(id: string): AgentRun | null
  /** Marks the run `succeeded` — for questions and results alike. */
  complete(id: string, result: RunCompletion): void
  fail(id: string, status: 'failed' | 'timeout'): void
  /** Runs of a ticket in `seq` order, optionally of one stage only. */
  listForTicket(ticketKey: string, stage?: ArtifactStage): AgentRun[]
  /** Runs still `running` — survivors of a restart. */
  findStuck(): AgentRun[]
}
```

`packages/core/src/ports/artifactRepository.ts`:

```ts
import type { Artifact, ArtifactStage } from '../domain/types'

export interface ArtifactRepository {
  /** Records a freshly opened PR (`prState: open`). */
  create(input: {
    ticketKey: string
    stage: ArtifactStage
    path: string
    branch: string
    prNumber: number
    prUrl: string
  }): Artifact
  /** All artifacts of a ticket, oldest first. */
  listForTicket(ticketKey: string): Artifact[]
  /** The newest artifact of the stage whose PR is still open. */
  findOpen(ticketKey: string, stage: ArtifactStage): Artifact | null
  markMerged(id: string, mergedAt: Date): void
  markClosed(id: string): void
}
```

`packages/core/src/ports/auditLog.ts`:

```ts
export type AuditActor = 'human' | 'agent' | 'system'

export type AuditEventType =
  | 'ticket_imported'
  | 'run_started'
  | 'run_finished'
  | 'question_asked'
  | 'answer_given'
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  | 'stage_changed'
  | 'cleanup'
  | 'error'

export interface AuditEvent {
  ticketKey: string
  actor: AuditActor
  type: AuditEventType
  payload: unknown
  createdAt: Date
}

/** Persistent log per ticket. */
export interface AuditLog {
  append(event: { ticketKey: string; actor: AuditActor; type: AuditEventType; payload?: unknown }): void
  /** Entries of one ticket, oldest first. */
  listForTicket(ticketKey: string): AuditEvent[]
}
```

`packages/core/src/ports/ticketSource.ts`:

```ts
import type { SourceTicket } from '../domain/types'

/** Where raw tickets come from (Jira in production; Markdown files in the showcase). */
export interface TicketSource {
  /** All tickets, ordered by key. Malformed entries are skipped. */
  list(): SourceTicket[]
}
```

`packages/core/src/ports/codeHost.ts`:

```ts
import type { PrState } from '../domain/types'

export interface PullRequest {
  number: number
  url: string
  state: PrState
  headBranch: string
  mergedAt: Date | null
}

/** The target repository on its Git host (GitHub). All writes need a token. */
export interface CodeHost {
  defaultBranch(): Promise<string>
  /** Content of a file on the default branch; null if it does not exist. */
  readFile(path: string): Promise<string | null>
  /** Creates `name` from the head of the default branch. */
  createBranch(name: string): Promise<void>
  /** Creates or overwrites one file on `branch` in a single commit. */
  commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void>
  /** Opens a PR from `branch` against the default branch. */
  openPullRequest(input: { branch: string; title: string; body: string }): Promise<PullRequest>
  getPullRequest(number: number): Promise<PullRequest>
  /** Open PRs of the repository (first 100). */
  listOpenPullRequests(): Promise<PullRequest[]>
  closePullRequest(number: number): Promise<void>
  /** Deletes a branch; a missing branch is not an error. */
  deleteBranch(name: string): Promise<void>
}

/** A request to the code host failed. `status` is the HTTP status, 0 without response. Message is user-facing. */
export class CodeHostError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'CodeHostError'
  }
}
```

`packages/core/src/ports/agentRunner.ts` (ersetzt die Datei):

```ts
import type { StageOutput } from '@refinement/shared'
import type { ArtifactStage, QAPair } from '../domain/types'

export interface AgentRunnerInput {
  /** Ticket key; also the handle for `stop`. */
  ticketKey: string
  /** Selects skill and output schema. */
  stage: ArtifactStage
  title: string
  description: string
  /** Local clone of the target repository. */
  repoPath: string
  model: string
  codebaseSummary?: string
  /** Answered questions of earlier runs of this stage. */
  previousRuns: QAPair[]
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
  output: StageOutput
  meta: AgentRunMeta
}

export interface AgentRunner {
  /**
   * Runs the agent of the stage and returns its validated output.
   * @throws {AgentRunTerminatedError} when stopped via `stop`.
   * @throws {AgentRunTimeoutError} when the run exceeds its time limit.
   */
  run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult>
  /** Stops the running agent of the ticket. Returns false if none is running. */
  stop(ticketKey: string): boolean
}

/** The run was stopped on user request. */
export class AgentRunTerminatedError extends Error {
  constructor() {
    super('Agent run was terminated by user')
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

`packages/core/src/ports/eventPublisher.ts` (ersetzt die Datei):

```ts
import type { TicketEvent } from '@refinement/shared'

export interface EventPublisher {
  publish(event: TicketEvent): void
  /** Subscribes to the events of one ticket, or of all tickets with `null`. Returns the unsubscribe function. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
}
```

`packages/core/src/ports/index.ts` (ersetzt die Datei):

```ts
export type { TicketRepository } from './ticketRepository'
export type { AgentRunRepository, RunCompletion } from './agentRunRepository'
export type { ArtifactRepository } from './artifactRepository'
export type { AuditLog, AuditActor, AuditEvent, AuditEventType } from './auditLog'
export type { TicketSource } from './ticketSource'
export type { CodeHost, PullRequest } from './codeHost'
export { CodeHostError } from './codeHost'
export type { AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult } from './agentRunner'
export { AgentRunTerminatedError, AgentRunTimeoutError } from './agentRunner'
export type { RepoProvider } from './repoProvider'
export type { EventPublisher } from './eventPublisher'
```

`packages/core/src/adapters/nodeEvents/nodeEventPublisher.ts` (ersetzt die Datei):

```ts
import { EventEmitter } from 'events'
import type { TicketEvent } from '@refinement/shared'
import type { EventPublisher } from '../../ports'

const ALL_TICKETS = 'all'
const channel = (ticketKey: string | null) => (ticketKey === null ? ALL_TICKETS : `ticket:${ticketKey}`)

/**
 * In-process event bus on top of Node's EventEmitter: one channel per ticket plus one for all
 * tickets (board). Only reaches subscribers in the same process.
 */
export function createNodeEventPublisher(): EventPublisher {
  const emitter = new EventEmitter()
  // Every open browser tab subscribes; the default limit of 10 would trigger warnings.
  emitter.setMaxListeners(0)

  return {
    publish(event: TicketEvent) {
      emitter.emit(channel(event.ticketKey), event)
      emitter.emit(ALL_TICKETS, event)
    },
    subscribe(ticketKey, handler) {
      const name = channel(ticketKey)
      emitter.on(name, handler)
      return () => {
        emitter.off(name, handler)
      }
    },
  }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/adapters/nodeEvents`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports packages/core/src/adapters/nodeEvents
git commit -m "feat(core): Ports für Ticket-Quelle, Code-Host, Artefakte und Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Test-Fakes

**Files:**
- Replace: `packages/core/src/testing/fakes.ts`, `packages/core/src/testing/fakes.test.ts`

Hinweis: `fakes.ts` importiert `UseCaseDeps` aus `application/deps.ts`; diese Datei wird hier mit ersetzt (Step 3), weil sie nur ein Interface ist.

- [ ] **Step 1: Test schreiben** — `packages/core/src/testing/fakes.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect } from 'vitest'
import { AgentRunTerminatedError, CodeHostError } from '../ports'
import { createTestContext, seedTicket, sourceTicket } from './fakes'

describe('in-memory ticket repository', () => {
  it('inserts new tickets as plan/ready and keeps stage and state on update', () => {
    const { deps } = createTestContext()
    expect(deps.tickets.upsertFromSource([sourceTicket('CB-10'), sourceTicket('CB-2')])).toEqual(['CB-10', 'CB-2'])
    deps.tickets.update('CB-2', { stage: 'design', state: 'failed' })

    expect(deps.tickets.upsertFromSource([sourceTicket('CB-2', { title: 'Neu' })])).toEqual([])
    expect(deps.tickets.findByKey('CB-2')).toMatchObject({ title: 'Neu', stage: 'design', state: 'failed' })
    expect(deps.tickets.list().map((t) => t.key)).toEqual(['CB-2', 'CB-10'])
  })

  it('returns snapshots, not the stored objects', () => {
    const ctx = createTestContext()
    const ticket = seedTicket(ctx, 'CB-1')
    ticket.state = 'failed'
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
  })
})

describe('FakeCodeHost', () => {
  it('merges a PR like GitHub: the branch files land on the default branch', async () => {
    const { codeHost } = createTestContext()
    await codeHost.createBranch('CB-1/intent')
    await codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    const pr = await codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: 'b' })

    codeHost.merge(pr.number)

    expect(await codeHost.readFile('docs/work/CB-1/intent.md')).toBe('x')
    expect((await codeHost.getPullRequest(pr.number)).state).toBe('merged')
  })

  it('reports unknown PRs as 404 and injected failures as given', async () => {
    const { codeHost } = createTestContext()
    await expect(codeHost.getPullRequest(9)).rejects.toMatchObject({ status: 404 })
    codeHost.failures.readFile = new CodeHostError(0, 'offline')
    await expect(codeHost.readFile('a')).rejects.toThrow('offline')
  })
})

describe('FakeAgentRunner', () => {
  it('terminates a held run when it is stopped', async () => {
    const { agent } = createTestContext()
    const release = agent.hold()
    const run = agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, () => {})

    expect(agent.stop('CB-1')).toBe(true)
    release()

    await expect(run).rejects.toBeInstanceOf(AgentRunTerminatedError)
  })

  it('does not affect a later run when nothing was running', async () => {
    const { agent } = createTestContext()
    expect(agent.stop('CB-1')).toBe(false)
    const result = await agent.run({ ticketKey: 'CB-1', stage: 'plan', title: 't', description: 'd', repoPath: '/r', model: 'm', previousRuns: [] }, () => {})
    expect(result.output.type).toBe('intent')
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/testing/fakes.test.ts`
Expected: FAIL (`seedTicket`, `sourceTicket` fehlen).

- [ ] **Step 3: `deps.ts` und Fakes schreiben**

`packages/core/src/application/deps.ts` (ersetzt die Datei):

```ts
import type {
  AgentRunner,
  AgentRunRepository,
  ArtifactRepository,
  AuditLog,
  CodeHost,
  EventPublisher,
  RepoProvider,
  TicketRepository,
  TicketSource,
} from '../ports'

export interface UseCaseDeps {
  tickets: TicketRepository
  runs: AgentRunRepository
  artifacts: ArtifactRepository
  audit: AuditLog
  source: TicketSource
  /** null without `GITHUB_TOKEN`: the app cannot read stages from or write artifacts to the target repo. */
  codeHost: CodeHost | null
  agent: AgentRunner
  repos: RepoProvider
  events: EventPublisher
  /** Target repository (`TARGET_REPO`): cloned for the agent, linked in the UI. */
  repoUrl: string
  /** Receives fire-and-forget work (agent runs). The production implementation logs rejections. */
  runInBackground: (task: Promise<void>) => void
  /** Pause after stopping an agent before the ticket state is read again (process needs time to exit). */
  stopSettleMs: number
}
```

`packages/core/src/testing/fakes.ts` (ersetzt die Datei):

```ts
import type { Intent, IntentAgentOutput, TicketEvent } from '@refinement/shared'
import type { AgentRun, Artifact, SourceTicket, Stage, Ticket, TicketState } from '../domain/types'
import { compareTicketKeys } from '../domain/ticketKey'
import { errorCode } from '../domain/errors'
import {
  AgentRunTerminatedError,
  CodeHostError,
  type AgentRunner,
  type AgentRunnerInput,
  type AgentRunRepository,
  type AgentRunResult,
  type ArtifactRepository,
  type AuditEvent,
  type AuditLog,
  type CodeHost,
  type EventPublisher,
  type PullRequest,
  type RepoProvider,
  type TicketRepository,
  type TicketSource,
} from '../ports'
import type { UseCaseDeps } from '../application/deps'
import { createNodeEventPublisher } from '../adapters/nodeEvents/nodeEventPublisher'

export const TEST_REPO_URL = 'https://github.com/o/r'

export const SAMPLE_INTENT: Intent = {
  title: 'Lesezeit anzeigen',
  problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
  desiredOutcome: 'Die Artikel-API liefert eine geschätzte Lesezeit.',
  affected: ['Leser'],
  openPoints: [],
}

export const SAMPLE_INTENT_OUTPUT: IntentAgentOutput = { type: 'intent', result: SAMPLE_INTENT }

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

/** A source ticket as the Markdown source would deliver it. */
export function sourceTicket(key: string, patch: Partial<SourceTicket> = {}): SourceTicket {
  return {
    key,
    title: `Ticket ${key}`,
    description: `Beschreibung ${key}`,
    priority: 'Mittel',
    sourcePath: `examples/tickets/${key.toLowerCase()}.md`,
    ...patch,
  }
}

export interface InMemoryStore {
  tickets: Ticket[]
  runs: AgentRun[]
  artifacts: Artifact[]
  audit: AuditEvent[]
}

export function createInMemoryTicketRepository(store: InMemoryStore): TicketRepository {
  const find = (key: string) => store.tickets.find((t) => t.key === key)

  return {
    list: () => [...store.tickets].sort((a, b) => compareTicketKeys(a.key, b.key)).map((t) => ({ ...t })),
    findByKey: (key) => {
      const ticket = find(key)
      return ticket ? { ...ticket } : null
    },
    upsertFromSource(items) {
      const created: string[] = []
      const now = new Date()
      for (const item of items) {
        const fields = { title: item.title, description: item.description, priority: item.priority, sourcePath: item.sourcePath }
        const existing = find(item.key)
        if (existing) {
          Object.assign(existing, fields, { updatedAt: now })
        } else {
          store.tickets.push({ key: item.key, ...fields, stage: 'plan', state: 'ready', createdAt: now, updatedAt: now })
          created.push(item.key)
        }
      }
      return created
    },
    update(key, patch) {
      const ticket = find(key)
      if (!ticket) throw new Error(`Ticket ${key} not found`)
      if (patch.stage) ticket.stage = patch.stage
      if (patch.state) ticket.state = patch.state
      ticket.updatedAt = new Date()
      return { ...ticket }
    },
    clear() {
      store.tickets = []
      store.runs = []
      store.artifacts = []
      store.audit = []
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

  return {
    create(input) {
      if (!store.tickets.some((t) => t.key === input.ticketKey)) throw new Error(`Ticket ${input.ticketKey} not found`)
      const run: AgentRun = {
        id: `run-${nextId++}`, ticketKey: input.ticketKey, stage: input.stage,
        seq: store.runs.filter((r) => r.ticketKey === input.ticketKey).length + 1,
        trigger: input.trigger, input: input.input, output: null, status: 'running', model: input.model,
        costUsd: null, inputTokens: null, cacheCreationTokens: null, cacheReadTokens: null, outputTokens: null,
        startedAt: new Date(), finishedAt: null,
      }
      store.runs.push(run)
      return { ...run }
    },
    findById: (id) => {
      const run = store.runs.find((r) => r.id === id)
      return run ? { ...run } : null
    },
    complete(id, result) {
      Object.assign(requireRun(id), { status: 'succeeded', ...result, finishedAt: new Date() })
    },
    fail(id, status) {
      Object.assign(requireRun(id), { status, finishedAt: new Date() })
    },
    listForTicket: (ticketKey, stage) =>
      store.runs
        .filter((r) => r.ticketKey === ticketKey && (!stage || r.stage === stage))
        .sort((a, b) => a.seq - b.seq)
        .map((r) => ({ ...r })),
    findStuck: () => store.runs.filter((r) => r.status === 'running').map((r) => ({ ...r })),
  }
}

export function createInMemoryArtifactRepository(store: InMemoryStore): ArtifactRepository {
  let nextId = 1
  const requireArtifact = (id: string) => {
    const artifact = store.artifacts.find((a) => a.id === id)
    if (!artifact) throw new Error(`Artifact ${id} not found`)
    return artifact
  }

  return {
    create(input) {
      const artifact: Artifact = { id: `artifact-${nextId++}`, ...input, prState: 'open', mergedAt: null, createdAt: new Date() }
      store.artifacts.push(artifact)
      return { ...artifact }
    },
    listForTicket: (ticketKey) => store.artifacts.filter((a) => a.ticketKey === ticketKey).map((a) => ({ ...a })),
    findOpen(ticketKey, stage) {
      const open = store.artifacts.filter((a) => a.ticketKey === ticketKey && a.stage === stage && a.prState === 'open')
      const latest = open[open.length - 1]
      return latest ? { ...latest } : null
    },
    markMerged(id, mergedAt) {
      Object.assign(requireArtifact(id), { prState: 'merged', mergedAt })
    },
    markClosed(id) {
      requireArtifact(id).prState = 'closed'
    },
  }
}

export function createInMemoryAuditLog(store: InMemoryStore): AuditLog {
  return {
    append: (event) => {
      store.audit.push({ ...event, payload: event.payload ?? null, createdAt: new Date() })
    },
    listForTicket: (ticketKey) => store.audit.filter((e) => e.ticketKey === ticketKey).map((e) => ({ ...e })),
  }
}

export class FakeTicketSource implements TicketSource {
  tickets: SourceTicket[] = []

  list(): SourceTicket[] {
    return this.tickets.map((t) => ({ ...t }))
  }
}

/**
 * Agent that returns `outcome` (or throws it) and records every call.
 * Like the CLI, `stop` terminates a run that is still in progress.
 */
export class FakeAgentRunner implements AgentRunner {
  readonly calls: AgentRunnerInput[] = []
  readonly stopped: string[] = []
  progress: string[] = []
  outcome: AgentRunResult | Error = { output: SAMPLE_INTENT_OUTPUT, meta: SAMPLE_META }
  private gate: Promise<void> | null = null
  private readonly active = new Set<string>()
  private readonly terminated = new Set<string>()

  /** Holds every following run until the returned function is called. */
  hold(): () => void {
    let release = () => {}
    this.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    return () => {
      this.gate = null
      release()
    }
  }

  async run(input: AgentRunnerInput, onProgress: (message: string) => void): Promise<AgentRunResult> {
    this.calls.push(input)
    this.active.add(input.ticketKey)
    try {
      for (const message of this.progress) onProgress(message)
      if (this.gate) await this.gate
      if (this.terminated.delete(input.ticketKey)) throw new AgentRunTerminatedError()
      if (this.outcome instanceof Error) throw this.outcome
      return this.outcome
    } finally {
      this.active.delete(input.ticketKey)
    }
  }

  stop(ticketKey: string): boolean {
    this.stopped.push(ticketKey)
    if (!this.active.has(ticketKey)) return false
    this.terminated.add(ticketKey)
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

type CodeHostMethod = keyof CodeHost

export interface FakePullRequest extends PullRequest {
  title: string
  body: string
}

/** In-memory GitHub: files of the default branch, branches with their files, PRs. */
export class FakeCodeHost implements CodeHost {
  defaultBranchName = 'master'
  /** Files on the default branch. */
  readonly files = new Map<string, string>()
  /** Branch name → files committed on that branch. */
  readonly branches = new Map<string, Map<string, string>>()
  readonly pulls: FakePullRequest[] = []
  /** Every called method in order. */
  readonly calls: CodeHostMethod[] = []
  /** A method listed here throws the error on every call. */
  failures: Partial<Record<CodeHostMethod, Error>> = {}
  private nextPr = 1

  private enter(method: CodeHostMethod): void {
    this.calls.push(method)
    const failure = this.failures[method]
    if (failure) throw failure
  }

  private requirePull(number: number): FakePullRequest {
    const pr = this.pulls.find((p) => p.number === number)
    if (!pr) throw new CodeHostError(404, `PR #${number} nicht gefunden`)
    return pr
  }

  private addPull(branch: string, title: string, body: string): FakePullRequest {
    const number = this.nextPr++
    const pr: FakePullRequest = { number, url: `${TEST_REPO_URL}/pull/${number}`, state: 'open', headBranch: branch, mergedAt: null, title, body }
    this.pulls.push(pr)
    return pr
  }

  async defaultBranch(): Promise<string> {
    this.enter('defaultBranch')
    return this.defaultBranchName
  }

  async readFile(path: string): Promise<string | null> {
    this.enter('readFile')
    return this.files.get(path) ?? null
  }

  async createBranch(name: string): Promise<void> {
    this.enter('createBranch')
    if (this.branches.has(name)) throw new CodeHostError(422, `Branch ${name} existiert bereits`)
    this.branches.set(name, new Map())
  }

  async commitFile(input: { branch: string; path: string; content: string; message: string }): Promise<void> {
    this.enter('commitFile')
    const files = this.branches.get(input.branch)
    if (!files) throw new CodeHostError(404, `Branch ${input.branch} nicht gefunden`)
    files.set(input.path, input.content)
  }

  async openPullRequest(input: { branch: string; title: string; body: string }): Promise<PullRequest> {
    this.enter('openPullRequest')
    return { ...this.addPull(input.branch, input.title, input.body) }
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    this.enter('getPullRequest')
    return { ...this.requirePull(number) }
  }

  async listOpenPullRequests(): Promise<PullRequest[]> {
    this.enter('listOpenPullRequests')
    return this.pulls.filter((p) => p.state === 'open').map((p) => ({ ...p }))
  }

  async closePullRequest(number: number): Promise<void> {
    this.enter('closePullRequest')
    this.requirePull(number).state = 'closed'
  }

  async deleteBranch(name: string): Promise<void> {
    this.enter('deleteBranch')
    this.branches.delete(name)
  }

  /** Test helper: an open PR from `branch` (created if missing), e.g. left over from an earlier start. */
  seedPullRequest(branch: string): FakePullRequest {
    if (!this.branches.has(branch)) this.branches.set(branch, new Map())
    return this.addPull(branch, branch, '')
  }

  /** Test helper: merges like GitHub — the files of the head branch land on the default branch. */
  merge(number: number, at = new Date('2026-10-28T12:00:00Z')): void {
    const pr = this.requirePull(number)
    pr.state = 'merged'
    pr.mergedAt = at
    for (const [path, content] of this.branches.get(pr.headBranch) ?? []) this.files.set(path, content)
  }
}

export type RecordingEventPublisher = EventPublisher & { readonly published: TicketEvent[] }

/** Real in-process bus that additionally records every published event. */
export function createRecordingEventPublisher(): RecordingEventPublisher {
  const inner = createNodeEventPublisher()
  const published: TicketEvent[] = []
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
  /** Always present; `deps.codeHost` is null when created with `{ token: false }`. */
  codeHost: FakeCodeHost
  source: FakeTicketSource
  events: RecordingEventPublisher
  /** Waits for all background tasks handed to `runInBackground`. */
  settle(): Promise<void>
}

/** @param options.token - false simulates a missing `GITHUB_TOKEN` (`deps.codeHost` is null). */
export function createTestContext(options: { token?: boolean } = {}): TestContext {
  const store: InMemoryStore = { tickets: [], runs: [], artifacts: [], audit: [] }
  const agent = new FakeAgentRunner()
  const repos = new FakeRepoProvider()
  const codeHost = new FakeCodeHost()
  const source = new FakeTicketSource()
  const events = createRecordingEventPublisher()
  const tasks: Promise<void>[] = []

  const deps: UseCaseDeps = {
    tickets: createInMemoryTicketRepository(store),
    runs: createInMemoryAgentRunRepository(store),
    artifacts: createInMemoryArtifactRepository(store),
    audit: createInMemoryAuditLog(store),
    source,
    codeHost: options.token === false ? null : codeHost,
    agent,
    repos,
    events,
    repoUrl: TEST_REPO_URL,
    runInBackground: (task) => {
      tasks.push(task)
    },
    stopSettleMs: 0,
  }

  return {
    deps, store, agent, repos, codeHost, source, events,
    settle: async () => {
      await Promise.all(tasks)
    },
  }
}

/** Inserts one ticket directly into the repository (no import log entry) and returns it. */
export function seedTicket(
  ctx: TestContext,
  key = 'CB-1',
  patch: Partial<SourceTicket> & { stage?: Stage; state?: TicketState } = {},
): Ticket {
  const { stage, state, ...source } = patch
  ctx.deps.tickets.upsertFromSource([sourceTicket(key, source)])
  return ctx.deps.tickets.update(key, { stage, state })
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/testing/fakes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/testing packages/core/src/application/deps.ts
git commit -m "test(core): Fakes für Code-Host, Ticket-Quelle, Artefakte und Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: SQLite — Schema, Migration, alte Datenbanken

**Files:**
- Replace: `packages/core/src/adapters/sqlite/schema.ts`, `packages/core/src/adapters/sqlite/database.ts`
- Delete: `packages/core/drizzle/` (alle Dateien) — neu erzeugt
- Create: `packages/core/drizzle/0000_playbook_stages.sql` (+ `meta/`, generiert), `packages/core/src/adapters/sqlite/database.test.ts`

Das Modell ändert sich vollständig; laut Spec §4 werden keine Daten übernommen. Deshalb gibt es eine neue Ausgangsmigration, und eine Datenbank im alten Schema (erkennbar an der Tabelle `review_decisions`) wird beim Öffnen geleert und neu aufgebaut.

- [ ] **Step 1: Test schreiben** — `packages/core/src/adapters/sqlite/database.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { createSqliteDatabase } from './database'
import { tickets } from './schema'

const MIGRATIONS = path.resolve(__dirname, '../../../drizzle')

function tempDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-')), 'test.db')
}

function tableNames(file: string): string[] {
  const db = new Database(file)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]
  db.close()
  return rows.map((r) => r.name)
}

describe('createSqliteDatabase', () => {
  it('creates the playbook schema', () => {
    const file = tempDbFile()
    createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS }).$client.close()
    expect(tableNames(file)).toEqual(['__drizzle_migrations', 'agent_runs', 'artifacts', 'audit_events', 'tickets'])
  })

  it('rebuilds a database from before the playbook model', () => {
    const file = tempDbFile()
    const old = new Database(file)
    old.exec(`
      CREATE TABLE tickets (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE review_decisions (id TEXT);
      CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC);
      INSERT INTO tickets (title) VALUES ('alt');
    `)
    old.close()

    const db = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })

    expect(db.select().from(tickets).all()).toEqual([])
    db.$client.close()
    expect(tableNames(file)).not.toContain('review_decisions')
  })

  it('keeps the data of a current database', () => {
    const file = tempDbFile()
    const first = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })
    first.insert(tickets).values({ key: 'CB-1', title: 'T', sourcePath: 'x.md' }).run()
    first.$client.close()

    const second = createSqliteDatabase({ path: file, migrationsFolder: MIGRATIONS })
    expect(second.select().from(tickets).all().map((t) => t.key)).toEqual(['CB-1'])
  })
})
```

- [ ] **Step 2: Schema schreiben** — `packages/core/src/adapters/sqlite/schema.ts` (ersetzt die Datei):

```ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { randomBytes } from 'crypto'
import type { StageOutput } from '@refinement/shared'
import type { AgentRunInput } from '../../domain/types'
import type { AuditEventType } from '../../ports'

const id = () => text('id').primaryKey().$defaultFn(() => randomBytes(8).toString('hex'))
const timestamp = (name: string) => integer(name, { mode: 'timestamp' })
const createdAt = () => timestamp('created_at').notNull().$defaultFn(() => new Date())
const ticketKey = () => text('ticket_key').notNull().references(() => tickets.key, { onDelete: 'cascade' })
const artifactStage = () => text('stage', { enum: ['plan', 'design'] }).notNull()

export const tickets = sqliteTable('tickets', {
  key:         text('key').primaryKey(),
  title:       text('title').notNull(),
  description: text('description').notNull().default(''),
  priority:    text('priority'),
  sourcePath:  text('source_path').notNull(),
  stage:       text('stage', { enum: ['plan', 'design', 'done'] }).notNull().default('plan'),
  state:       text('state', { enum: ['ready', 'running', 'awaiting_answer', 'in_review', 'failed'] })
                 .notNull().default('ready'),
  createdAt:   createdAt(),
  updatedAt:   timestamp('updated_at').notNull().$defaultFn(() => new Date()),
})

export const agentRuns = sqliteTable('agent_runs', {
  id:                  id(),
  ticketKey:           ticketKey(),
  stage:               artifactStage(),
  seq:                 integer('seq').notNull(),
  trigger:             text('trigger', { enum: ['initial', 'answer'] }).notNull(),
  input:               text('input', { mode: 'json' }).$type<AgentRunInput>().notNull(),
  output:              text('output', { mode: 'json' }).$type<StageOutput | null>(),
  status:              text('status', { enum: ['running', 'succeeded', 'failed', 'timeout'] }).notNull(),
  model:               text('model').notNull(),
  costUsd:             real('cost_usd'),
  inputTokens:         integer('input_tokens'),
  cacheCreationTokens: integer('cache_creation_tokens'),
  cacheReadTokens:     integer('cache_read_tokens'),
  outputTokens:        integer('output_tokens'),
  startedAt:           timestamp('started_at').notNull().$defaultFn(() => new Date()),
  finishedAt:          timestamp('finished_at'),
})

export const artifacts = sqliteTable('artifacts', {
  id:        id(),
  ticketKey: ticketKey(),
  stage:     artifactStage(),
  path:      text('path').notNull(),
  branch:    text('branch').notNull(),
  prNumber:  integer('pr_number').notNull(),
  prUrl:     text('pr_url').notNull(),
  prState:   text('pr_state', { enum: ['open', 'merged', 'closed'] }).notNull().default('open'),
  mergedAt:  timestamp('merged_at'),
  createdAt: createdAt(),
})

export const auditEvents = sqliteTable('audit_events', {
  id:        id(),
  ticketKey: ticketKey(),
  actor:     text('actor', { enum: ['human', 'agent', 'system'] }).notNull(),
  type:      text('type').$type<AuditEventType>().notNull(),
  payload:   text('payload', { mode: 'json' }),
  createdAt: createdAt(),
})
```

- [ ] **Step 3: Migration neu erzeugen**

```bash
cd packages/core
git rm -r -q drizzle
npx drizzle-kit generate --name playbook_stages
ls drizzle drizzle/meta
```

Expected: `drizzle/0000_playbook_stages.sql` mit `CREATE TABLE` für `agent_runs`, `artifacts`, `audit_events`, `tickets` sowie `drizzle/meta/_journal.json` und `drizzle/meta/0000_snapshot.json`. Die SQL-Datei nicht von Hand ändern.

- [ ] **Step 4: Alte Datenbanken neu aufbauen** — `packages/core/src/adapters/sqlite/database.ts` (ersetzt die Datei):

```ts
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type SqliteDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

const IN_MEMORY = ':memory:'

/** Tables of the schema before the playbook model; `review_decisions` exists only there. */
const LEGACY_TABLES = ['review_decisions', 'audit_events', 'agent_runs', 'tickets', '__drizzle_migrations']

/**
 * The playbook model replaced the whole schema and no data is carried over (spec §4):
 * an old database is emptied so the migrations build it from scratch.
 */
function dropLegacySchema(sqlite: Database.Database): void {
  const legacy = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'review_decisions'").get()
  if (!legacy) return
  for (const table of LEGACY_TABLES) sqlite.exec(`DROP TABLE IF EXISTS "${table}"`)
  console.warn('[db] Datenbank im alten Schema gefunden — neu aufgebaut')
}

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
  dropLegacySchema(sqlite)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: options.migrationsFolder })
  return db
}
```

`dropLegacySchema` läuft vor `foreign_keys = ON`, damit das Löschen in beliebiger Reihenfolge klappt.

- [ ] **Step 5: Test grün**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/database.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
git add -A packages/core/drizzle packages/core/src/adapters/sqlite/schema.ts packages/core/src/adapters/sqlite/database.ts packages/core/src/adapters/sqlite/database.test.ts
git commit -m "feat(core): SQLite-Schema für Stufen, Artefakte und Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: SQLite — Tickets

**Files:**
- Replace: `packages/core/src/adapters/sqlite/ticketRepository.ts`, `packages/core/src/adapters/sqlite/ticketRepository.test.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/adapters/sqlite/ticketRepository.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import type { TicketRepository } from '../../ports'

let repo: TicketRepository

beforeEach(() => {
  repo = createSqliteTicketRepository(createTestDatabase())
})

describe('upsertFromSource', () => {
  it('inserts new tickets as plan/ready and returns their keys', () => {
    expect(repo.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2', { priority: null })])).toEqual(['CB-1', 'CB-2'])
    expect(repo.findByKey('CB-1')).toMatchObject({
      key: 'CB-1', title: 'Ticket CB-1', description: 'Beschreibung CB-1', priority: 'Mittel',
      sourcePath: 'examples/tickets/cb-1.md', stage: 'plan', state: 'ready',
    })
    expect(repo.findByKey('CB-2')?.priority).toBeNull()
  })

  it('updates the text of known tickets and keeps stage and state', () => {
    repo.upsertFromSource([sourceTicket('CB-1')])
    repo.update('CB-1', { stage: 'design', state: 'failed' })

    expect(repo.upsertFromSource([sourceTicket('CB-1', { title: 'Neu', description: 'Neu D' })])).toEqual([])
    expect(repo.findByKey('CB-1')).toMatchObject({ title: 'Neu', description: 'Neu D', stage: 'design', state: 'failed' })
  })
})

describe('list / findByKey', () => {
  it('orders by key numerically', () => {
    repo.upsertFromSource([sourceTicket('CB-10'), sourceTicket('CB-2'), sourceTicket('AB-1')])
    expect(repo.list().map((t) => t.key)).toEqual(['AB-1', 'CB-2', 'CB-10'])
  })

  it('returns null for unknown keys', () => {
    expect(repo.findByKey('CB-404')).toBeNull()
  })
})

describe('update', () => {
  it('changes only the given fields and returns the ticket', () => {
    repo.upsertFromSource([sourceTicket('CB-1')])
    expect(repo.update('CB-1', { state: 'running' })).toMatchObject({ stage: 'plan', state: 'running' })
    expect(repo.update('CB-1', { stage: 'design', state: 'ready' })).toMatchObject({ stage: 'design', state: 'ready' })
  })

  it('throws for unknown tickets', () => {
    expect(() => repo.update('CB-404', { state: 'ready' })).toThrow('CB-404')
  })
})

describe('clear', () => {
  it('removes all tickets', () => {
    repo.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
    repo.clear()
    expect(repo.list()).toEqual([])
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/ticketRepository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — `packages/core/src/adapters/sqlite/ticketRepository.ts` (ersetzt die Datei):

```ts
import { eq } from 'drizzle-orm'
import type { TicketRepository } from '../../ports'
import { compareTicketKeys } from '../../domain/ticketKey'
import type { SqliteDb } from './database'
import { tickets } from './schema'

export function createSqliteTicketRepository(db: SqliteDb): TicketRepository {
  return {
    list: () => db.select().from(tickets).all().sort((a, b) => compareTicketKeys(a.key, b.key)),

    findByKey: (key) => db.select().from(tickets).where(eq(tickets.key, key)).get() ?? null,

    upsertFromSource(items) {
      return db.transaction((tx) => {
        const created: string[] = []
        for (const item of items) {
          const fields = { title: item.title, description: item.description, priority: item.priority, sourcePath: item.sourcePath }
          const existing = tx.select({ key: tickets.key }).from(tickets).where(eq(tickets.key, item.key)).get()
          if (existing) {
            tx.update(tickets).set({ ...fields, updatedAt: new Date() }).where(eq(tickets.key, item.key)).run()
          } else {
            tx.insert(tickets).values({ key: item.key, ...fields }).run()
            created.push(item.key)
          }
        }
        return created
      })
    },

    update(key, patch) {
      const row = db.update(tickets).set({ ...patch, updatedAt: new Date() }).where(eq(tickets.key, key)).returning().get()
      if (!row) throw new Error(`Ticket ${key} not found`)
      return row
    },

    clear() {
      db.delete(tickets).run()
    },
  }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/ticketRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/sqlite/ticketRepository.ts packages/core/src/adapters/sqlite/ticketRepository.test.ts
git commit -m "feat(core): SQLite-Repository für Tickets mit Upsert aus der Quelle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: SQLite — Agent-Läufe

**Files:**
- Replace: `packages/core/src/adapters/sqlite/agentRunRepository.ts`, `packages/core/src/adapters/sqlite/agentRunRepository.test.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/adapters/sqlite/agentRunRepository.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { SAMPLE_INTENT_OUTPUT, sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAgentRunRepository } from './agentRunRepository'
import type { AgentRunRepository, TicketRepository } from '../../ports'

const INPUT = { model: 'm', previousRuns: [] }

let tickets: TicketRepository
let runs: AgentRunRepository

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  runs = createSqliteAgentRunRepository(db)
  tickets.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
})

const create = (ticketKey = 'CB-1', stage: 'plan' | 'design' = 'plan') =>
  runs.create({ ticketKey, stage, trigger: 'initial', input: INPUT, model: 'm' })

describe('create', () => {
  it('numbers runs per ticket and starts them running', () => {
    expect(create('CB-1')).toMatchObject({ seq: 1, status: 'running', stage: 'plan', output: null, input: INPUT })
    expect(create('CB-1').seq).toBe(2)
    expect(create('CB-2').seq).toBe(1)
  })

  it('throws for unknown tickets', () => {
    expect(() => create('CB-404')).toThrow()
  })
})

describe('complete / fail', () => {
  it('stores output, cost and tokens', () => {
    const run = create()
    runs.complete(run.id, {
      output: SAMPLE_INTENT_OUTPUT, costUsd: 0.5, inputTokens: 10, cacheCreationTokens: 1, cacheReadTokens: 2, outputTokens: 3,
    })
    expect(runs.findById(run.id)).toMatchObject({ status: 'succeeded', output: SAMPLE_INTENT_OUTPUT, costUsd: 0.5, outputTokens: 3 })
    expect(runs.findById(run.id)?.finishedAt).toBeInstanceOf(Date)
  })

  it('marks failures', () => {
    const run = create()
    runs.fail(run.id, 'timeout')
    expect(runs.findById(run.id)?.status).toBe('timeout')
  })
})

describe('listForTicket / findStuck', () => {
  it('lists runs of a ticket in order, optionally of one stage', () => {
    create('CB-1', 'plan')
    create('CB-1', 'design')
    create('CB-2', 'plan')
    expect(runs.listForTicket('CB-1').map((r) => r.seq)).toEqual([1, 2])
    expect(runs.listForTicket('CB-1', 'design').map((r) => r.seq)).toEqual([2])
  })

  it('finds runs left running', () => {
    const stuck = create()
    runs.fail(create().id, 'failed')
    expect(runs.findStuck().map((r) => r.id)).toEqual([stuck.id])
  })

  it('removes runs together with their tickets', () => {
    create()
    tickets.clear()
    expect(runs.findStuck()).toEqual([])
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/agentRunRepository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — `packages/core/src/adapters/sqlite/agentRunRepository.ts` (ersetzt die Datei):

```ts
import { and, count, eq } from 'drizzle-orm'
import type { AgentRunRepository } from '../../ports'
import type { SqliteDb } from './database'
import { agentRuns } from './schema'

export function createSqliteAgentRunRepository(db: SqliteDb): AgentRunRepository {
  return {
    create(input) {
      return db.transaction((tx) => {
        const existing = tx.select({ n: count() }).from(agentRuns).where(eq(agentRuns.ticketKey, input.ticketKey)).get()
        return tx.insert(agentRuns).values({
          ticketKey: input.ticketKey,
          stage: input.stage,
          seq: (existing?.n ?? 0) + 1,
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

    listForTicket: (ticketKey, stage) =>
      db.select().from(agentRuns)
        .where(and(eq(agentRuns.ticketKey, ticketKey), stage ? eq(agentRuns.stage, stage) : undefined))
        .orderBy(agentRuns.seq)
        .all(),

    findStuck: () => db.select().from(agentRuns).where(eq(agentRuns.status, 'running')).all(),
  }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/agentRunRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/sqlite/agentRunRepository.ts packages/core/src/adapters/sqlite/agentRunRepository.test.ts
git commit -m "feat(core): SQLite-Repository für Agent-Läufe pro Stufe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: SQLite — Artefakte und Log

**Files:**
- Create: `packages/core/src/adapters/sqlite/artifactRepository.ts`, `packages/core/src/adapters/sqlite/artifactRepository.test.ts`
- Replace: `packages/core/src/adapters/sqlite/auditLog.ts`, `packages/core/src/adapters/sqlite/auditLog.test.ts`

- [ ] **Step 1: Tests schreiben**

`packages/core/src/adapters/sqlite/artifactRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteArtifactRepository } from './artifactRepository'
import type { ArtifactRepository, TicketRepository } from '../../ports'

let tickets: TicketRepository
let artifacts: ArtifactRepository

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  artifacts = createSqliteArtifactRepository(db)
  tickets.upsertFromSource([sourceTicket('CB-1')])
})

const open = (prNumber: number) =>
  artifacts.create({
    ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent',
    prNumber, prUrl: `https://github.com/o/r/pull/${prNumber}`,
  })

describe('artifacts', () => {
  it('records an open PR', () => {
    expect(open(7)).toMatchObject({ prNumber: 7, prState: 'open', mergedAt: null, branch: 'CB-1/intent' })
  })

  it('finds the newest open artifact of a stage', () => {
    const first = open(1)
    artifacts.markClosed(first.id)
    const second = open(2)
    expect(artifacts.findOpen('CB-1', 'plan')?.id).toBe(second.id)
    expect(artifacts.findOpen('CB-1', 'design')).toBeNull()
  })

  it('marks merges with their time', () => {
    const artifact = open(3)
    const at = new Date('2026-10-28T12:00:00Z')
    artifacts.markMerged(artifact.id, at)
    expect(artifacts.listForTicket('CB-1')[0]).toMatchObject({ prState: 'merged', mergedAt: at })
    expect(artifacts.findOpen('CB-1', 'plan')).toBeNull()
  })

  it('lists artifacts oldest first and removes them with the ticket', () => {
    open(1)
    open(2)
    expect(artifacts.listForTicket('CB-1').map((a) => a.prNumber)).toEqual([1, 2])
    tickets.clear()
    expect(artifacts.listForTicket('CB-1')).toEqual([])
  })
})
```

`packages/core/src/adapters/sqlite/auditLog.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteAuditLog } from './auditLog'
import type { AuditLog, TicketRepository } from '../../ports'

let tickets: TicketRepository
let audit: AuditLog

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  audit = createSqliteAuditLog(db)
  tickets.upsertFromSource([sourceTicket('CB-1'), sourceTicket('CB-2')])
})

describe('audit log', () => {
  it('lists the entries of one ticket in insertion order', () => {
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'run_started', payload: { runId: 'a' } })
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'run_started' })
    audit.append({ ticketKey: 'CB-1', actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' } })

    const entries = audit.listForTicket('CB-1')
    expect(entries.map((e) => e.type)).toEqual(['run_started', 'question_asked'])
    expect(entries[1]).toMatchObject({ ticketKey: 'CB-1', actor: 'agent', payload: { question: 'Wer?' } })
    expect(entries[1]?.createdAt).toBeInstanceOf(Date)
  })

  it('stores a missing payload as null', () => {
    audit.append({ ticketKey: 'CB-2', actor: 'system', type: 'cleanup' })
    expect(audit.listForTicket('CB-2')[0]?.payload).toBeNull()
  })

  it('removes entries with the ticket', () => {
    audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'cleanup' })
    tickets.clear()
    expect(audit.listForTicket('CB-1')).toEqual([])
  })
})
```

- [ ] **Step 2: Tests fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/sqlite/artifactRepository.test.ts src/adapters/sqlite/auditLog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`packages/core/src/adapters/sqlite/artifactRepository.ts`:

```ts
import { and, desc, eq, sql } from 'drizzle-orm'
import type { ArtifactRepository } from '../../ports'
import type { SqliteDb } from './database'
import { artifacts } from './schema'

/** Insertion order; `created_at` has only second precision. */
const insertionOrder = sql`rowid`

export function createSqliteArtifactRepository(db: SqliteDb): ArtifactRepository {
  const requireUpdated = (row: unknown, id: string) => {
    if (!row) throw new Error(`Artifact ${id} not found`)
  }

  return {
    create: (input) => db.insert(artifacts).values(input).returning().get(),

    listForTicket: (ticketKey) =>
      db.select().from(artifacts).where(eq(artifacts.ticketKey, ticketKey)).orderBy(insertionOrder).all(),

    findOpen: (ticketKey, stage) =>
      db.select().from(artifacts)
        .where(and(eq(artifacts.ticketKey, ticketKey), eq(artifacts.stage, stage), eq(artifacts.prState, 'open')))
        .orderBy(desc(insertionOrder))
        .limit(1)
        .get() ?? null,

    markMerged(id, mergedAt) {
      requireUpdated(db.update(artifacts).set({ prState: 'merged', mergedAt }).where(eq(artifacts.id, id)).returning().get(), id)
    },

    markClosed(id) {
      requireUpdated(db.update(artifacts).set({ prState: 'closed' }).where(eq(artifacts.id, id)).returning().get(), id)
    },
  }
}
```

`packages/core/src/adapters/sqlite/auditLog.ts` (ersetzt die Datei):

```ts
import { eq, sql } from 'drizzle-orm'
import type { AuditLog } from '../../ports'
import type { SqliteDb } from './database'
import { auditEvents } from './schema'

export function createSqliteAuditLog(db: SqliteDb): AuditLog {
  return {
    append(event) {
      db.insert(auditEvents).values({
        ticketKey: event.ticketKey,
        actor: event.actor,
        type: event.type,
        payload: event.payload ?? null,
      }).run()
    },

    listForTicket: (ticketKey) =>
      db.select({
        ticketKey: auditEvents.ticketKey,
        actor: auditEvents.actor,
        type: auditEvents.type,
        payload: auditEvents.payload,
        createdAt: auditEvents.createdAt,
      })
        .from(auditEvents)
        .where(eq(auditEvents.ticketKey, ticketKey))
        // Insertion order; `created_at` has only second precision.
        .orderBy(sql`rowid`)
        .all(),
  }
}
```

- [ ] **Step 4: Tests grün**

Run: `cd packages/core && npx vitest run src/adapters/sqlite`
Expected: PASS (alle SQLite-Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/sqlite
git commit -m "feat(core): SQLite-Repositories für Artefakte und Ticket-Log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: Adapter `markdownTickets` (Ticket-Quelle)

**Files:**
- Create: `packages/core/src/adapters/markdownTickets/markdownTicketSource.ts`, `packages/core/src/adapters/markdownTickets/markdownTicketSource.test.ts`

Format einer Ticket-Datei (wie `examples/tickets/cb-2-lesezeit.md`): erste Zeile `# CB-2: Titel`, danach freier Text, optional eine Zeile `**Priorität:** Mittel`.

- [ ] **Step 1: Test schreiben** — `packages/core/src/adapters/markdownTickets/markdownTicketSource.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createMarkdownTicketSource, parseTicketMarkdown } from './markdownTicketSource'

const REPO_ROOT = path.resolve(__dirname, '../../../../..')

/** Writes the files into `<tmp>/tickets` and returns `<tmp>`. */
function writeTickets(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tickets-'))
  fs.mkdirSync(path.join(root, 'tickets'))
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, 'tickets', name), content)
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseTicketMarkdown', () => {
  it('reads key, title, description and priority', () => {
    const md = '# CB-2: Lesezeit anzeigen\n\nLeser wollen es wissen.\nZweite Zeile.\n\n**Priorität:** Mittel\n'
    expect(parseTicketMarkdown(md, 'x/cb-2.md')).toEqual({
      key: 'CB-2', title: 'Lesezeit anzeigen', description: 'Leser wollen es wissen.\nZweite Zeile.',
      priority: 'Mittel', sourcePath: 'x/cb-2.md',
    })
  })

  it('accepts files without priority and with Windows line endings', () => {
    expect(parseTicketMarkdown('# CB-9: T\r\n\r\nText\r\n', 'a.md')).toMatchObject({ description: 'Text', priority: null })
  })

  it('returns null without a ticket heading in the first line', () => {
    expect(parseTicketMarkdown('# Seed-Tickets\n\nText', 'README.md')).toBeNull()
    expect(parseTicketMarkdown('Text\n# CB-1: T', 'a.md')).toBeNull()
  })
})

describe('createMarkdownTicketSource', () => {
  it('reads all ticket files sorted by key, with paths relative to the root', () => {
    const root = writeTickets({
      'cb-10-x.md': '# CB-10: Zehn\n\nText',
      'cb-2-y.md': '# CB-2: Zwei\n\nText',
      'README.md': '# Tickets\n\nAnleitung',
      'notes.txt': '# CB-3: kein Markdown',
    })
    const source = createMarkdownTicketSource({ dir: path.join(root, 'tickets'), rootDir: root })
    expect(source.list().map((t) => [t.key, t.sourcePath])).toEqual([
      ['CB-2', 'tickets/cb-2-y.md'],
      ['CB-10', 'tickets/cb-10-x.md'],
    ])
  })

  it('warns about malformed files and duplicate keys and skips them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = writeTickets({
      'a.md': '# CB-1: Erste\n\nText',
      'b.md': '# CB-1: Doppelt\n\nText',
      'c.md': 'kein Ticket',
    })
    const source = createMarkdownTicketSource({ dir: path.join(root, 'tickets'), rootDir: root })
    expect(source.list().map((t) => t.title)).toEqual(['Erste'])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('reads the shipped example tickets', () => {
    const source = createMarkdownTicketSource({ dir: path.join(REPO_ROOT, 'examples', 'tickets'), rootDir: REPO_ROOT })
    const tickets = source.list()
    expect(tickets.map((t) => t.key)).toEqual(['CB-1', 'CB-2', 'CB-3'])
    expect(tickets[1]).toMatchObject({
      title: 'Lesezeit bei Artikeln anzeigen', priority: 'Mittel', sourcePath: 'examples/tickets/cb-2-lesezeit.md',
    })
    expect(tickets[1]?.description).toMatch(/^Leser möchten vorher sehen/)
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/markdownTickets`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `packages/core/src/adapters/markdownTickets/markdownTicketSource.ts`:

```ts
import fs from 'fs'
import path from 'path'
import type { TicketSource } from '../../ports'
import type { SourceTicket } from '../../domain/types'
import { TICKET_KEY_PATTERN, compareTicketKeys } from '../../domain/ticketKey'

const HEADING_RE = new RegExp(`^#\\s+(${TICKET_KEY_PATTERN}):\\s*(.+?)\\s*$`)
const PRIORITY_RE = /^\*\*Priorität:\*\*\s*(.+?)\s*$/
const README = 'README.md'

/**
 * Parses one ticket file: `# CB-3: Titel` in the first line, free text, optional `**Priorität:** …` line.
 * Returns null when the first line is no ticket heading (e.g. README.md).
 */
export function parseTicketMarkdown(markdown: string, sourcePath: string): SourceTicket | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const heading = HEADING_RE.exec(lines[0] ?? '')
  if (!heading) return null

  let priority: string | null = null
  const body: string[] = []
  for (const line of lines.slice(1)) {
    const match = PRIORITY_RE.exec(line)
    if (match) priority = match[1]!
    else body.push(line)
  }
  return { key: heading[1]!, title: heading[2]!, description: body.join('\n').trim(), priority, sourcePath }
}

export interface MarkdownTicketSourceOptions {
  /** Directory with the ticket files, e.g. `examples/tickets`. */
  dir: string
  /** `sourcePath` is relative to this directory (the repository root). */
  rootDir: string
}

/**
 * Ticket source of the showcase: every `*.md` file in `dir` simulates one Jira ticket.
 * Read on every call, so a new file shows up after a restart or reset.
 */
export function createMarkdownTicketSource(options: MarkdownTicketSourceOptions): TicketSource {
  return {
    list() {
      const tickets: SourceTicket[] = []
      const seen = new Set<string>()
      const names = fs.readdirSync(options.dir).filter((name) => name.endsWith('.md')).sort()

      for (const name of names) {
        const file = path.join(options.dir, name)
        const sourcePath = path.relative(options.rootDir, file).split(path.sep).join('/')
        const ticket = parseTicketMarkdown(fs.readFileSync(file, 'utf-8'), sourcePath)
        if (!ticket) {
          if (name !== README) console.warn(`[tickets] ${sourcePath}: erste Zeile ist keine Überschrift "# KEY-n: Titel" — übersprungen`)
          continue
        }
        if (seen.has(ticket.key)) {
          console.warn(`[tickets] ${sourcePath}: Schlüssel ${ticket.key} kommt doppelt vor — übersprungen`)
          continue
        }
        seen.add(ticket.key)
        tickets.push(ticket)
      }
      return tickets.sort((a, b) => compareTicketKeys(a.key, b.key))
    },
  }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/adapters/markdownTickets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/markdownTickets
git commit -m "feat(core): Ticket-Quelle aus examples/tickets/*.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: Adapter `github` (Code-Host über Octokit)

**Files:**
- Modify: `packages/core/package.json` (Abhängigkeit), `packages/core/tsconfig.json`, `package-lock.json`
- Create: `packages/core/src/adapters/github/githubCodeHost.ts`, `packages/core/src/adapters/github/githubCodeHost.test.ts`

`@octokit/rest` v22 ist ein reines ES-Modul. Die Typprüfung des Kerns braucht dafür `moduleResolution: "bundler"`; Vitest und Next.js laden das Modul ohnehin über ihren Bundler.

- [ ] **Step 1: Abhängigkeit und tsconfig**

```bash
npm install @octokit/rest@^22.0.1 -w packages/core
```

In `packages/core/tsconfig.json` die zwei Zeilen

```json
    "module": "CommonJS",
    "moduleResolution": "node",
```

ersetzen durch

```json
    "module": "ESNext",
    "moduleResolution": "bundler",
```

- [ ] **Step 2: Test schreiben** — `packages/core/src/adapters/github/githubCodeHost.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createGitHubCodeHost, parseGitHubRepoUrl } from './githubCodeHost'

interface Route { status: number; body?: unknown }
interface Call { method: string; path: string; query: string; body: unknown }

/** Minimal GitHub REST stand-in for Octokit's injectable fetch. Unknown routes answer 404. */
function fakeGitHub(routes: Record<string, Route>) {
  const calls: Call[] = []
  const fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = decodeURIComponent(url.pathname)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path, query: url.search, body })
    const route = routes[`${method} ${path}`] ?? { status: 404, body: { message: 'Not Found' } }
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
  return { fetch: fetchFn as typeof fetch, calls }
}

const REPO_ROUTE = { 'GET /repos/o/r': { status: 200, body: { default_branch: 'master' } } }

function setup(routes: Record<string, Route> = {}) {
  const gh = fakeGitHub({ ...REPO_ROUTE, ...routes })
  const codeHost = createGitHubCodeHost({ repoUrl: 'https://github.com/o/r', token: 't', fetch: gh.fetch })
  return { gh, codeHost }
}

const base64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64')
const INTENT_PATH = 'docs/work/CB-1/intent.md'
const pr = (patch: Record<string, unknown> = {}) => ({
  number: 7, html_url: 'https://github.com/o/r/pull/7', state: 'open', merged_at: null, head: { ref: 'CB-1/intent' }, ...patch,
})

describe('parseGitHubRepoUrl', () => {
  it('reads owner and repo', () => {
    expect(parseGitHubRepoUrl('https://github.com/o/r')).toEqual({ owner: 'o', repo: 'r' })
    expect(parseGitHubRepoUrl('https://github.com/o/r.git')).toEqual({ owner: 'o', repo: 'r' })
  })

  it('rejects other hosts', () => {
    expect(() => parseGitHubRepoUrl('https://gitlab.com/o/r')).toThrow('TARGET_REPO')
  })
})

describe('reading', () => {
  it('reads a file from the default branch', async () => {
    const { gh, codeHost } = setup({
      [`GET /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { type: 'file', encoding: 'base64', content: base64('# Intent'), sha: 's1' } },
    })
    expect(await codeHost.readFile(INTENT_PATH)).toBe('# Intent')
    expect(gh.calls.find((c) => c.path.includes('/contents/'))?.query).toBe('?ref=master')
  })

  it('returns null for missing files and asks for the default branch only once', async () => {
    const { gh, codeHost } = setup()
    expect(await codeHost.readFile('a.md')).toBeNull()
    expect(await codeHost.readFile('b.md')).toBeNull()
    expect(gh.calls.filter((c) => c.path === '/repos/o/r')).toHaveLength(1)
  })
})

describe('writing', () => {
  it('creates a branch from the head of the default branch', async () => {
    const { gh, codeHost } = setup({
      'GET /repos/o/r/git/ref/heads/master': { status: 200, body: { object: { sha: 'abc' } } },
      'POST /repos/o/r/git/refs': { status: 201, body: { ref: 'refs/heads/CB-1/intent' } },
    })
    await codeHost.createBranch('CB-1/intent')
    expect(gh.calls.find((c) => c.method === 'POST')?.body).toEqual({ ref: 'refs/heads/CB-1/intent', sha: 'abc' })
  })

  it('commits a new file without sha and an existing one with its sha', async () => {
    const created = setup({ [`PUT /repos/o/r/contents/${INTENT_PATH}`]: { status: 201, body: { content: {} } } })
    await created.codeHost.commitFile({ branch: 'CB-1/intent', path: INTENT_PATH, content: '# x', message: 'CB-1: Intent' })
    expect(created.gh.calls.find((c) => c.method === 'PUT')?.body).toEqual({
      message: 'CB-1: Intent', content: base64('# x'), branch: 'CB-1/intent',
    })

    const updated = setup({
      [`GET /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { type: 'file', encoding: 'base64', content: base64('old'), sha: 's1' } },
      [`PUT /repos/o/r/contents/${INTENT_PATH}`]: { status: 200, body: { content: {} } },
    })
    await updated.codeHost.commitFile({ branch: 'CB-1/intent', path: INTENT_PATH, content: '# x', message: 'm' })
    expect(updated.gh.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ sha: 's1' })
    expect(decodeURIComponent(updated.gh.calls.find((c) => c.method === 'GET' && c.path.includes('/contents/'))?.query ?? '')).toBe('?ref=CB-1/intent')
  })

  it('opens a PR against the default branch', async () => {
    const { gh, codeHost } = setup({ 'POST /repos/o/r/pulls': { status: 201, body: pr() } })
    expect(await codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: 'b' })).toEqual({
      number: 7, url: 'https://github.com/o/r/pull/7', state: 'open', headBranch: 'CB-1/intent', mergedAt: null,
    })
    expect(gh.calls.find((c) => c.method === 'POST')?.body).toEqual({ head: 'CB-1/intent', base: 'master', title: 'CB-1: Intent', body: 'b' })
  })

  it('closes PRs and deletes branches; a missing branch is fine', async () => {
    const { gh, codeHost } = setup({
      'PATCH /repos/o/r/pulls/7': { status: 200, body: pr({ state: 'closed' }) },
      'DELETE /repos/o/r/git/refs/heads/CB-1/intent': { status: 204 },
      'DELETE /repos/o/r/git/refs/heads/CB-2/intent': { status: 422, body: { message: 'Reference does not exist' } },
    })
    await codeHost.closePullRequest(7)
    await codeHost.deleteBranch('CB-1/intent')
    await codeHost.deleteBranch('CB-2/intent')
    await codeHost.deleteBranch('CB-3/intent') // 404
    expect(gh.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ state: 'closed' })
  })
})

describe('pull requests', () => {
  it('maps merged, closed and open PRs', async () => {
    const { codeHost } = setup({
      'GET /repos/o/r/pulls/7': { status: 200, body: pr({ state: 'closed', merged_at: '2026-10-28T12:00:00Z' }) },
      'GET /repos/o/r/pulls/8': { status: 200, body: pr({ number: 8, state: 'closed' }) },
    })
    expect(await codeHost.getPullRequest(7)).toMatchObject({ state: 'merged', mergedAt: new Date('2026-10-28T12:00:00Z') })
    expect(await codeHost.getPullRequest(8)).toMatchObject({ state: 'closed', mergedAt: null })
  })

  it('lists open PRs with their head branch', async () => {
    const { gh, codeHost } = setup({
      'GET /repos/o/r/pulls': { status: 200, body: [pr(), pr({ number: 8, head: { ref: 'feature/x' } })] },
    })
    expect((await codeHost.listOpenPullRequests()).map((p) => p.headBranch)).toEqual(['CB-1/intent', 'feature/x'])
    expect(gh.calls.find((c) => c.path === '/repos/o/r/pulls')?.query).toContain('state=open')
  })
})

describe('errors', () => {
  it('turns HTTP errors into CodeHostError with a helpful message', async () => {
    const { codeHost } = setup({ 'POST /repos/o/r/pulls': { status: 403, body: { message: 'Resource not accessible by personal access token' } } })
    await expect(codeHost.openPullRequest({ branch: 'CB-1/intent', title: 't', body: 'b' })).rejects.toMatchObject({
      name: 'CodeHostError',
      status: 403,
      message: expect.stringContaining('Pull requests'),
    })
  })

  it('reports a wrong token', async () => {
    const { codeHost } = setup({ 'GET /repos/o/r/pulls': { status: 401, body: { message: 'Bad credentials' } } })
    await expect(codeHost.listOpenPullRequests()).rejects.toMatchObject({ status: 401, message: expect.stringContaining('GITHUB_TOKEN') })
  })
})
```

- [ ] **Step 3: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/github`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: Implementieren** — `packages/core/src/adapters/github/githubCodeHost.ts`:

```ts
import { Octokit } from '@octokit/rest'
import { CodeHostError, type CodeHost, type PullRequest } from '../../ports'

export interface GitHubCodeHostOptions {
  /** `https://github.com/<owner>/<repo>`, optionally with `.git`. */
  repoUrl: string
  /** Fine-grained PAT with Contents and Pull requests: Read and write. */
  token: string
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/

export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
  const match = REPO_URL_RE.exec(url.trim())
  if (!match) throw new Error(`TARGET_REPO ist keine GitHub-URL (https://github.com/<owner>/<repo>): ${url}`)
  return { owner: match[1]!, repo: match[2]! }
}

const STATUS_HINT: Record<number, string> = {
  401: 'GitHub lehnt das Token ab (401) — GITHUB_TOKEN prüfen.',
  403: 'Dem GitHub-Token fehlen Rechte (403) — nötig sind Contents und Pull requests, jeweils "Read and write".',
  404: 'Bei GitHub nicht gefunden (404) — TARGET_REPO und den Repo-Zugriff des Tokens prüfen.',
}

function statusOf(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : 0
}

function toCodeHostError(err: unknown, action: string): CodeHostError {
  const status = statusOf(err)
  const detail = err instanceof Error ? err.message : String(err)
  const hint = STATUS_HINT[status] ?? (status === 422 ? `GitHub lehnt die Anfrage ab (422): ${detail}` : `GitHub-Fehler: ${detail}`)
  return new CodeHostError(status, `${action}: ${hint}`)
}

interface GitHubPull {
  number: number
  html_url: string
  state: string
  merged_at: string | null
  head: { ref: string }
}

function toPullRequest(pr: GitHubPull): PullRequest {
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : 'closed',
    headBranch: pr.head.ref,
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
  }
}

/** CodeHost port backed by the GitHub REST API. */
export function createGitHubCodeHost(options: GitHubCodeHostOptions): CodeHost {
  const { owner, repo } = parseGitHubRepoUrl(options.repoUrl)
  const octokit = new Octokit({ auth: options.token, request: options.fetch ? { fetch: options.fetch } : undefined })
  let cachedDefaultBranch: string | null = null

  /** Runs one API step and turns every failure into a user-facing CodeHostError. */
  const step = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      throw toCodeHostError(err, action)
    }
  }

  const defaultBranch = () =>
    step('Default-Branch lesen', async () => {
      cachedDefaultBranch ??= (await octokit.rest.repos.get({ owner, repo })).data.default_branch
      return cachedDefaultBranch
    })

  /** Content and blob sha of a file on `ref`; null if it does not exist. */
  const getFile = async (path: string, ref: string): Promise<{ content: string; sha: string } | null> => {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref })
      if (Array.isArray(data) || data.type !== 'file') return null
      return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha }
    } catch (err) {
      if (statusOf(err) === 404) return null
      throw err
    }
  }

  return {
    defaultBranch,

    async readFile(path) {
      const ref = await defaultBranch()
      return step(`${path} lesen`, async () => (await getFile(path, ref))?.content ?? null)
    },

    async createBranch(name) {
      const base = await defaultBranch()
      await step(`Branch ${name} anlegen`, async () => {
        const { data } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` })
        await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${name}`, sha: data.object.sha })
      })
    },

    async commitFile({ branch, path, content, message }) {
      await step(`${path} committen`, async () => {
        const existing = await getFile(path, branch)
        await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path, branch, message,
          content: Buffer.from(content, 'utf-8').toString('base64'),
          sha: existing?.sha,
        })
      })
    },

    async openPullRequest({ branch, title, body }) {
      const base = await defaultBranch()
      return step(`PR für ${branch} öffnen`, async () =>
        toPullRequest((await octokit.rest.pulls.create({ owner, repo, head: branch, base, title, body })).data))
    },

    getPullRequest: (number) =>
      step(`PR #${number} lesen`, async () => toPullRequest((await octokit.rest.pulls.get({ owner, repo, pull_number: number })).data)),

    listOpenPullRequests: () =>
      step('Offene PRs lesen', async () =>
        (await octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 100 })).data.map(toPullRequest)),

    closePullRequest: (number) =>
      step(`PR #${number} schließen`, async () => {
        await octokit.rest.pulls.update({ owner, repo, pull_number: number, state: 'closed' })
      }),

    deleteBranch: (name) =>
      step(`Branch ${name} löschen`, async () => {
        try {
          await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${name}` })
        } catch (err) {
          // GitHub answers 422 (or 404) for a branch that does not exist.
          if (statusOf(err) !== 404 && statusOf(err) !== 422) throw err
        }
      }),
  }
}
```

Falls `octokit.rest.pulls.list(...).data` sich nicht direkt an `toPullRequest` übergeben lässt (Typfehler wegen abweichender Feldtypen), `.map((p) => toPullRequest(p))` verwenden — das Interface `GitHubPull` enthält nur Felder, die beide Antworten haben.

- [ ] **Step 5: Test grün, Typen der neuen Datei sauber**

Run: `cd packages/core && npx vitest run src/adapters/github && npx tsc --noEmit 2>&1 | grep -E "adapters/github|octokit" ; echo "exit: done"`
Expected: Tests PASS; die `grep`-Zeile gibt nichts aus (andere Typfehler im Kern sind bis Task 19 erwartet).

- [ ] **Step 6: Commit**

```bash
git add package-lock.json packages/core/package.json packages/core/tsconfig.json packages/core/src/adapters/github
git commit -m "feat(core): GitHub als Code-Host über Octokit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 13: Claude-CLI-Adapter je Stufe und Skill des Intent-Agents

**Files:**
- Create: `packages/core/skills/intent-agent.md`
- Replace: `packages/core/src/adapters/claudeCli/index.ts`, `prompt.ts`, `types.ts`, `index.test.ts`, `prompt.test.ts`
- Unchanged: `packages/core/src/adapters/claudeCli/errors.ts`, `packages/core/skills/refinement-agent.md` (Teil B)

- [ ] **Step 1: Skill schreiben** — `packages/core/skills/intent-agent.md`:

````markdown
# Intent Agent Skill

You are the intent agent of stage 1 (Plan) of an AI-native software development lifecycle. You turn a raw
ticket — written by a stakeholder, often vague — into a clear **intent**: which problem exists, which
outcome is wanted, who is affected and what is still open.

You do **not** design a solution: no implementation plan, no file list, no API design. That is the job of
stage 2 (Design), which starts from your intent once a human has merged it.

## Your Task

1. Read the ticket.
2. Use the codebase only to understand the domain as it is today — which entities, roles and flows exist
   (e.g. is there a moderator role? does an article have a status?). A **Codebase-Übersicht** may be
   provided; use it first and read files only for specific facts.
3. Decide whether a **blocking** question must be answered first (see below).
4. Write the intent.

## Blocking Question (use sparingly)

Ask only if the intent cannot be stated without a decision that only the stakeholder can make — for
example who the target user is or what must happen as a result — and neither the ticket nor the codebase
answers it.

- Ask at most one question per run.
- If **Bisherige Rückfragen** is present, those questions are answered. Do not ask them again.
- Everything that is unclear but not blocking goes into `openPoints`.

## Output-Format

Your entire answer is exactly one JSON object — no text before or after it, no Markdown code block.

**Option 1 — Rückfrage:**
{ "type": "question", "question": "<konkrete Frage an den Stakeholder>" }

**Option 2 — Intent:**
{
  "type": "intent",
  "result": {
    "title": "<max 60 Zeichen>",
    "problem": "<Wer hat welches Problem und warum? 2–5 Sätze>",
    "desiredOutcome": "<Woran erkennt man, dass das Problem gelöst ist? Beobachtbares Ergebnis, keine Umsetzung>",
    "affected": ["<Rolle oder Bereich, z. B. Leser, Autoren, Artikel-API>"],
    "openPoints": [{ "question": "<offene, nicht blockierende Frage>" }]
  }
}

## Rules

- Never modify files in the repository — read only.
- Write in the language of the ticket.
- Stay at the level of problem and outcome; mention code only where it explains today's behaviour.
````

- [ ] **Step 2: Tests schreiben**

`packages/core/src/adapters/claudeCli/prompt.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'

const BASE = {
  skill: '# Intent Agent Skill',
  ticketKey: 'CB-2',
  title: 'Lesezeit bei Artikeln anzeigen',
  description: 'Leser möchten vorher sehen, wie lange ein Artikel dauert.',
  previousRuns: [],
}

describe('buildPrompt', () => {
  it('contains skill, key, title and description', () => {
    const prompt = buildPrompt(BASE)
    expect(prompt).toContain('# Intent Agent Skill')
    expect(prompt).toContain('Ticket: CB-2')
    expect(prompt).toContain('# Lesezeit bei Artikeln anzeigen')
    expect(prompt).toContain('## Beschreibung\nLeser möchten')
  })

  it('adds the codebase summary on the first attempt', () => {
    expect(buildPrompt({ ...BASE, codebaseSummary: 'Express + Prisma' })).toContain('## Codebase-Übersicht\n\nExpress + Prisma')
  })

  it('adds answered questions', () => {
    const prompt = buildPrompt({ ...BASE, previousRuns: [{ question: 'Wer?', answer: 'Alle Leser' }] })
    expect(prompt).toContain('## Bisherige Rückfragen (bereits beantwortet)')
    expect(prompt).toContain('**F:** Wer?\n**A:** Alle Leser')
  })

  it('builds a correction prompt without the summary on retry', () => {
    const prompt = buildPrompt({
      ...BASE,
      codebaseSummary: 'Express + Prisma',
      retryContext: { previousOutput: 'x'.repeat(4000), schemaError: 'Agent output failed schema validation: Agent output is not valid JSON' },
    })
    expect(prompt).not.toContain('Codebase-Übersicht')
    expect(prompt).toContain('## Korrektur erforderlich')
    expect(prompt).toContain('kein gültiges JSON')
    expect(prompt).not.toContain('x'.repeat(3001))
  })
})
```

`packages/core/src/adapters/claudeCli/index.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import path from 'path'
import type { AgentRunnerInput } from '../../ports'

const OPTIONS = { skillsDir: path.resolve(__dirname, '../../../skills') }

const INTENT_OUTPUT = JSON.stringify({
  type: 'intent',
  result: {
    title: 'Lesezeit anzeigen',
    problem: 'Leser wissen nicht, wie lange ein Artikel dauert.',
    desiredOutcome: 'Die API liefert eine Lesezeit.',
    affected: ['Leser'],
    openPoints: [],
  },
})

const resultLine = (result: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'result', subtype: 'success', result, ...extra })

function makeFakeProcess(stdout: string, exitCode: number) {
  const proc = new EventEmitter() as any
  proc.stdin = { write: vi.fn(), end: vi.fn() }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  setTimeout(() => {
    proc.stdout.emit('data', Buffer.from(stdout + '\n'))
    proc.emit('close', exitCode)
  }, 10)
  return proc
}

vi.mock('child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

const INPUT: AgentRunnerInput = {
  ticketKey: 'CB-2', stage: 'plan', title: 'Lesezeit', description: 'D', repoPath: '/tmp/repo',
  model: 'claude-sonnet-4-6', previousRuns: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runAgent (stage plan)', () => {
  it.each([
    ['plain JSON', INTENT_OUTPUT],
    ['a json code fence', '```json\n' + INTENT_OUTPUT + '\n```'],
    ['text before the JSON', 'Hier ist das Ergebnis:\n\n' + INTENT_OUTPUT],
  ])('parses %s', async (_label, text) => {
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(text), 0))
    const { runAgent } = await import('./index')
    const { output } = await runAgent(INPUT, vi.fn(), OPTIONS)
    expect(output).toMatchObject({ type: 'intent', result: { title: 'Lesezeit anzeigen' } })
  })

  it('sends the intent skill and reports usage', async () => {
    const proc = makeFakeProcess(
      resultLine(INTENT_OUTPUT, { cost_usd: 0.04, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 } }),
      0,
    )
    mockSpawn.mockReturnValue(proc)
    const { runAgent } = await import('./index')
    const { meta } = await runAgent(INPUT, vi.fn(), OPTIONS)
    expect(proc.stdin.write.mock.calls[0][0]).toContain('# Intent Agent Skill')
    expect(meta).toMatchObject({ model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, costUsd: 0.04 })
  })

  it('retries once on invalid output, then throws SchemaValidationError', async () => {
    const refinement = JSON.stringify({ type: 'refinement', result: {} })
    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(refinement), 0))
    const { runAgent } = await import('./index')
    const { SchemaValidationError } = await import('./errors')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(SchemaValidationError)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('throws CliError on a non-zero exit code', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess('', 1))
    const { runAgent } = await import('./index')
    const { CliError } = await import('./errors')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(CliError)
  })

  it('throws AgentRunTimeoutError when claude does not answer in time', async () => {
    const proc = new EventEmitter() as any
    proc.stdin = { write: vi.fn(), end: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    mockSpawn.mockReturnValue(proc)
    process.env['REFINEMENT_TIMEOUT_MS'] = '50'
    const { runAgent } = await import('./index')
    const { AgentRunTimeoutError } = await import('../../ports')
    await expect(runAgent(INPUT, vi.fn(), OPTIONS)).rejects.toBeInstanceOf(AgentRunTimeoutError)
    delete process.env['REFINEMENT_TIMEOUT_MS']
  })

  it('rejects stages without an agent before spawning claude', async () => {
    const { runAgent } = await import('./index')
    await expect(runAgent({ ...INPUT, stage: 'design' }, vi.fn(), OPTIONS)).rejects.toThrow('design')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

describe('createClaudeCliAgentRunner', () => {
  it('runs through the AgentRunner port', async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(resultLine(INTENT_OUTPUT), 0))
    const { createClaudeCliAgentRunner } = await import('./index')
    const { output } = await createClaudeCliAgentRunner(OPTIONS).run(INPUT, vi.fn())
    expect(output.type).toBe('intent')
  })

  it('returns false when stopping a ticket without a running process', async () => {
    const { createClaudeCliAgentRunner } = await import('./index')
    expect(createClaudeCliAgentRunner(OPTIONS).stop('CB-404')).toBe(false)
  })
})
```

- [ ] **Step 3: Tests fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/adapters/claudeCli`
Expected: FAIL (`runAgent` fehlt, Prompt-Felder anders).

- [ ] **Step 4: Implementieren**

`packages/core/src/adapters/claudeCli/types.ts` (ersetzt die Datei):

```ts
import type { StageOutput } from '@refinement/shared'
import type { SchemaValidationError } from './errors'

export interface ClaudeStreamMessage {
  content?: Array<Record<string, unknown>>
}

export interface ClaudeTokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface ExtractedResult {
  text: string
  inputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  outputTokens: number
  costUsd: number
}

export type AttemptResult =
  | { ok: true; output: StageOutput; cliResult: ExtractedResult }
  | { ok: false; cliResult: ExtractedResult; error: SchemaValidationError }
```

`packages/core/src/adapters/claudeCli/prompt.ts` (ersetzt die Datei):

```ts
import type { QAPair } from '../../domain/types'

const MAX_RETRY_OUTPUT_CHARS = 3000
const INVALID_JSON_ERROR = 'Agent output is not valid JSON'

export interface PromptInput {
  skill: string
  ticketKey: string
  title: string
  description: string
  codebaseSummary?: string
  previousRuns: QAPair[]
  retryContext?: {
    previousOutput: string
    schemaError: string
  }
}

/**
 * Builds the full prompt for the Claude CLI: skill, ticket and answered questions.
 * With `retryContext` it becomes a correction prompt that quotes the malformed output.
 */
export function buildPrompt(input: PromptInput): string {
  const parts = input.retryContext
    ? [input.skill, '---', ...ticketSection(input), previousRunsSection(input), correctionSection(input.retryContext)]
    : [input.skill, '---', summarySection(input), ...ticketSection(input), previousRunsSection(input)]
  return parts.filter((part): part is string => Boolean(part)).join('\n\n')
}

function ticketSection(input: PromptInput): string[] {
  return [`Ticket: ${input.ticketKey}`, `# ${input.title}`, `## Beschreibung\n${input.description}`]
}

/** Omitted on retry: the agent already analysed the codebase. */
function summarySection(input: PromptInput): string | null {
  return input.codebaseSummary ? `## Codebase-Übersicht\n\n${input.codebaseSummary}\n\n---` : null
}

function previousRunsSection(input: PromptInput): string | null {
  if (!input.previousRuns.length) return null
  const pairs = input.previousRuns.map(({ question, answer }) => `**F:** ${question}\n**A:** ${answer}`).join('\n\n')
  return `## Bisherige Rückfragen (bereits beantwortet)\n\n${pairs}`
}

function correctionSection(retry: NonNullable<PromptInput['retryContext']>): string {
  return [
    '## Korrektur erforderlich',
    // The message reaches us wrapped by SchemaValidationError, hence `includes`.
    retry.schemaError.includes(INVALID_JSON_ERROR)
      ? 'Dein letzter Output enthielt kein gültiges JSON. Du hast vermutlich Text statt JSON ausgegeben:'
      : 'Du hast die Codebase bereits analysiert. Dein letzter Output war strukturell ungültig:',
    '',
    '```',
    retry.previousOutput.slice(0, MAX_RETRY_OUTPUT_CHARS),
    '```',
    '',
    `**Fehler:** ${retry.schemaError}`,
    '',
    'Gib jetzt AUSSCHLIESSLICH das JSON-Objekt aus — kein Text davor oder danach, kein Markdown.',
  ].join('\n')
}
```

`packages/core/src/adapters/claudeCli/index.ts` (ersetzt die Datei; Prozess-Handling, Stream-Parsing und Retry sind unverändert übernommen, neu sind `STAGE_AGENTS`, das Schema als Parameter und die Namen `runAgent`/`stopAgent`):

```ts
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import type { ZodIssue, ZodType } from 'zod'
import { IntentAgentOutputSchema, type StageOutput } from '@refinement/shared'
import { SchemaValidationError, CliError } from './errors'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../../ports'
import type { AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult } from '../../ports'
import type { ArtifactStage } from '../../domain/types'
import { buildPrompt } from './prompt'
import type { ClaudeStreamMessage, ClaudeTokenUsage, ExtractedResult, AttemptResult } from './types'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const SIGTERM_EXIT_CODE = 143
const ALLOWED_TOOLS = 'Read,LS,Bash'
const MS_PER_SECOND = 1000
const UTF8 = 'utf-8' as const
const SCHEMA_ERROR_PREVIEW_CHARS = 120
const MARKDOWN_CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/

interface StageAgent {
  skillFile: string
  schema: ZodType<StageOutput>
}

/** Skill and output schema per stage. Part B adds `design`. */
const STAGE_AGENTS: Partial<Record<ArtifactStage, StageAgent>> = {
  plan: { skillFile: 'intent-agent.md', schema: IntentAgentOutputSchema },
}

const runningProcesses = new Map<string, ChildProcess>()

const TOOL_PROGRESS_MESSAGE: Record<string, string> = {
  Read: 'Codebase wird analysiert...',
  LS:   'Codebase wird analysiert...',
  Bash: 'Codebase wird analysiert...',
}

/**
 * Interprets the Claude process exit code and returns the extracted result, or throws an appropriate error.
 * @param code   - Process exit code, or null if the process was killed.
 * @param output - Full stdout of the Claude process.
 * @param stderr - Full stderr of the Claude process, included in CliError on non-zero exit.
 */
function parseProcessExit(code: number | null, output: string, stderr: string): ExtractedResult {
  if (code === SIGTERM_EXIT_CODE || code === null) throw new AgentRunTerminatedError()
  if (code !== 0) throw new CliError(code, stderr)
  return extractResult(output)
}

/**
 * Parses one stream-JSON line and emits a progress message if a new tool_use block is detected.
 * Returns the (possibly updated) last progress message to avoid emitting duplicates.
 */
function handleLine(line: string, lastProgressMsg: string, onProgress: (msg: string) => void): string {
  const trimmed = line.trim()
  if (!trimmed) return lastProgressMsg
  try {
    const ev = JSON.parse(trimmed) as Record<string, unknown>
    if (ev.type !== 'assistant') return lastProgressMsg
    const content = (ev.message as ClaudeStreamMessage)?.content ?? []
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const msg = TOOL_PROGRESS_MESSAGE[block.name as string]
      if (msg && msg !== lastProgressMsg) { lastProgressMsg = msg; onProgress(msg) }
    }
  } catch { /* incomplete line */ }
  return lastProgressMsg
}

/**
 * Sends SIGTERM to the running Claude process of the ticket. Returns false if none is running.
 * @param ticketKey - e.g. `CB-2`.
 */
export function stopAgent(ticketKey: string): boolean {
  const proc = runningProcesses.get(ticketKey)
  if (!proc) return false
  runningProcesses.delete(ticketKey)
  proc.kill('SIGTERM')
  return true
}

/**
 * Spawns the Claude CLI, pipes the prompt via stdin and streams stdout line by line for progress events.
 * Rejects with AgentRunTimeoutError, AgentRunTerminatedError or CliError.
 */
async function spawnClaude(
  ticketKey: string,
  prompt: string,
  cwd: string,
  model: string,
  onProgress: (msg: string) => void,
): Promise<ExtractedResult> {
  const parsedTimeout = parseInt(process.env['REFINEMENT_TIMEOUT_MS'] ?? '', 10)
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_TIMEOUT_MS

  return new Promise<ExtractedResult>((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }

    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--allowedTools', ALLOWED_TOOLS,
    ], { cwd, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] })

    runningProcesses.set(ticketKey, proc)
    const cleanup = () => { runningProcesses.delete(ticketKey) }

    let stderrBuf = ''

    const timer = setTimeout(() => {
      cleanup()
      proc.kill('SIGTERM')
      settle(() => reject(new AgentRunTimeoutError(timeoutMs)))
    }, timeoutMs)

    proc.stdin.write(prompt)
    proc.stdin.end()

    let output = ''
    let stdoutBuf = ''
    let lastProgressMsg = ''

    proc.stdout.on('data', (d: Buffer) => {
      const chunk = d.toString()
      output += chunk
      stdoutBuf += chunk
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) lastProgressMsg = handleLine(line, lastProgressMsg, onProgress)
    })

    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      settle(() => {
        try { resolve(parseProcessExit(code, output, stderrBuf)) }
        catch (e) { reject(e as Error) }
      })
    })
  })
}

/** Finds the `result`/`success` line of the stream-JSON output. @throws CliError if there is none. */
function extractResult(raw: string): ExtractedResult {
  for (const line of raw.split('\n')) {
    try {
      const obj = JSON.parse(line.trim()) as Record<string, unknown>
      if (obj.type === 'result' && obj.subtype === 'success') {
        const usage = obj.usage as ClaudeTokenUsage | undefined
        return {
          text: (obj.result as string) ?? '',
          inputTokens: usage?.input_tokens ?? 0,
          cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
          cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          costUsd: typeof obj.cost_usd === 'number' ? obj.cost_usd : 0,
        } satisfies ExtractedResult
      }
    } catch { /* skip */ }
  }
  throw new CliError(-1, 'No success result in stream-json output')
}

/** Strips a Markdown fence if present, otherwise takes the outermost `{...}`. */
function extractJsonString(raw: string): string {
  const s = raw.trim()
  const fenceMatch = s.match(MARKDOWN_CODE_BLOCK_RE)
  if (fenceMatch) return fenceMatch[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) return s.slice(start, end + 1)
  return s
}

/** Parses the agent text and validates it against the stage schema. @throws SchemaValidationError */
function parseAndValidate(raw: string, schema: ZodType<StageOutput>): StageOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonString(raw))
  } catch {
    throw new SchemaValidationError(
      [{ message: 'Agent output is not valid JSON', path: [], code: 'custom', input: undefined }] as ZodIssue[],
      raw,
    )
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new SchemaValidationError(result.error.issues, raw)
  return result.data
}

/** One Claude attempt; schema failures are returned, all other errors are thrown. */
async function runAttempt(
  agent: { skill: string; schema: ZodType<StageOutput> },
  input: AgentRunnerInput,
  onProgress: (msg: string) => void,
  retryContext?: { previousOutput: string; schemaError: string },
): Promise<AttemptResult> {
  const prompt = buildPrompt({
    skill: agent.skill,
    ticketKey: input.ticketKey,
    title: input.title,
    description: input.description,
    codebaseSummary: input.codebaseSummary,
    previousRuns: input.previousRuns,
    retryContext,
  })

  const cliResult = await spawnClaude(input.ticketKey, prompt, input.repoPath, input.model, onProgress)
  try {
    return { ok: true, output: parseAndValidate(cliResult.text, agent.schema), cliResult } satisfies AttemptResult
  } catch (err) {
    if (err instanceof SchemaValidationError) return { ok: false, cliResult, error: err } satisfies AttemptResult
    throw err
  }
}

/** Sums tokens and cost of both attempts so the full run cost is reported. */
function aggregateCliResults(first: ExtractedResult, retry: ExtractedResult): ExtractedResult {
  return {
    text: retry.text,
    inputTokens: first.inputTokens + retry.inputTokens,
    cacheCreationTokens: first.cacheCreationTokens + retry.cacheCreationTokens,
    cacheReadTokens: first.cacheReadTokens + retry.cacheReadTokens,
    outputTokens: first.outputTokens + retry.outputTokens,
    costUsd: first.costUsd + retry.costUsd,
  }
}

/** Progress messages before the retry: preview of the malformed output and the validation error. */
function reportSchemaError(rawOutput: string | undefined, message: string, onProgress: (msg: string) => void): void {
  const preview = (rawOutput ?? '').slice(0, SCHEMA_ERROR_PREVIEW_CHARS).replace(/\n/g, ' ')
  onProgress(`Schema-Fehler, Retry... (Output: "${preview}")`)
  onProgress(`Schema-Validierungsfehler: ${message}`)
}

function buildMeta(model: string, startedAt: number, cliResult: ExtractedResult): AgentRunMeta {
  return {
    model,
    durationSeconds: Math.round((Date.now() - startedAt) / MS_PER_SECOND),
    inputTokens: cliResult.inputTokens,
    cacheCreationTokens: cliResult.cacheCreationTokens,
    cacheReadTokens: cliResult.cacheReadTokens,
    outputTokens: cliResult.outputTokens,
    costUsd: cliResult.costUsd,
  }
}

export interface ClaudeCliOptions {
  /** Absolute path to `packages/core/skills`. */
  skillsDir: string
}

/**
 * Runs the agent of `input.stage` and returns its validated output.
 * One automatic retry on a SchemaValidationError (the retry prompt quotes the malformed output);
 * terminate, timeout and CLI errors propagate immediately. Tokens and cost cover both attempts.
 * @throws {Error} if the stage has no agent yet.
 * @throws {AgentRunTerminatedError} if the process is killed via `stopAgent`.
 * @throws {AgentRunTimeoutError} if the run exceeds `REFINEMENT_TIMEOUT_MS`.
 * @throws {CliError} if the Claude process exits with a non-zero code.
 * @throws {SchemaValidationError} if both attempts produce invalid output.
 */
export async function runAgent(
  input: AgentRunnerInput,
  onProgress: (msg: string) => void,
  options: ClaudeCliOptions,
): Promise<AgentRunResult> {
  const stageAgent = STAGE_AGENTS[input.stage]
  if (!stageAgent) throw new Error(`Für die Stufe ${input.stage} gibt es noch keinen Agent`)
  const agent = {
    skill: await fs.readFile(path.join(options.skillsDir, stageAgent.skillFile), UTF8),
    schema: stageAgent.schema,
  }
  const startedAt = Date.now()

  const first = await runAttempt(agent, input, onProgress)
  if (first.ok) return { output: first.output, meta: buildMeta(input.model, startedAt, first.cliResult) }

  reportSchemaError(first.error.rawOutput, first.error.message, onProgress)
  const retry = await runAttempt(agent, input, onProgress, {
    previousOutput: first.error.rawOutput ?? first.error.message,
    schemaError: first.error.message,
  })
  if (!retry.ok) throw retry.error

  return { output: retry.output, meta: buildMeta(input.model, startedAt, aggregateCliResults(first.cliResult, retry.cliResult)) }
}

/** AgentRunner port backed by the headless Claude Code CLI (`claude --print`). */
export function createClaudeCliAgentRunner(options: ClaudeCliOptions): AgentRunner {
  return {
    run: (input, onProgress) => runAgent(input, onProgress, options),
    stop: (ticketKey) => stopAgent(ticketKey),
  }
}
```

- [ ] **Step 5: Tests grün**

Run: `cd packages/core && npx vitest run src/adapters/claudeCli`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/skills/intent-agent.md packages/core/src/adapters/claudeCli
git commit -m "feat(core): Agent je Stufe im Claude-CLI-Adapter, Skill des Intent-Agents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: Anwendung — Hilfen und Abfragen

**Files:**
- Create: `packages/core/src/application/messages.ts`, `describeError.ts`, `failStage.ts`
- Replace: `packages/core/src/application/reporter.ts`, `requireTicket.ts`, `dto.ts`, `queries.ts`, `queries.test.ts`
- Delete: `packages/core/src/application/commands.ts`, `commands.test.ts`, `refinementJobs.ts`, `refinementJobs.test.ts`

- [ ] **Step 1: Alte Use Cases löschen**

```bash
git rm packages/core/src/application/commands.ts packages/core/src/application/commands.test.ts \
       packages/core/src/application/refinementJobs.ts packages/core/src/application/refinementJobs.test.ts
```

- [ ] **Step 2: Test schreiben** — `packages/core/src/application/queries.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { getSettings, getTicket, listTickets } from './queries'

afterEach(() => {
  vi.restoreAllMocks()
})

function openIntentPr(ctx: TestContext, key: string, prNumber: number) {
  return ctx.deps.artifacts.create({
    ticketKey: key, stage: 'plan', path: `docs/work/${key}/intent.md`, branch: `${key}/intent`,
    prNumber, prUrl: `https://github.com/o/r/pull/${prNumber}`,
  })
}

describe('listTickets', () => {
  it('lists tickets by key with the open PR of the current stage', () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-10')
    seedTicket(ctx, 'CB-2', { state: 'in_review' })
    openIntentPr(ctx, 'CB-2', 4)

    const tickets = listTickets(ctx.deps)

    expect(tickets.map((t) => t.key)).toEqual(['CB-2', 'CB-10'])
    expect(tickets[0]).toMatchObject({ state: 'in_review', openPr: { number: 4, url: 'https://github.com/o/r/pull/4', state: 'open' } })
    expect(tickets[1]?.openPr).toBeNull()
  })
})

describe('getTicket', () => {
  it('shows both stages; open stages have no content and need no GitHub call', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')

    const detail = await getTicket(ctx.deps, 'CB-1')

    expect(detail.stages).toEqual([
      {
        stage: 'plan', path: 'docs/work/CB-1/intent.md',
        fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-1/intent.md',
        completed: false, pr: null, mergedAt: null, content: null,
      },
      {
        stage: 'design', path: 'docs/work/CB-1/spec.md',
        fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-1/spec.md',
        completed: false, pr: null, mergedAt: null, content: null,
      },
    ])
    expect(ctx.codeHost.calls).toEqual([])
  })

  it('reads the content of completed stages live from the default branch', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { stage: 'design' })
    const artifact = openIntentPr(ctx, 'CB-1', 1)
    const mergedAt = new Date('2026-10-28T12:00:00Z')
    ctx.deps.artifacts.markMerged(artifact.id, mergedAt)
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', '# CB-1: Intent')

    const [plan, design] = (await getTicket(ctx.deps, 'CB-1')).stages

    expect(plan).toMatchObject({ completed: true, content: '# CB-1: Intent', mergedAt, pr: { number: 1, state: 'merged' } })
    expect(design).toMatchObject({ completed: false, content: null, pr: null })
  })

  it('shows no content without token or when GitHub fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noToken = createTestContext({ token: false })
    seedTicket(noToken, 'CB-1', { stage: 'design' })
    expect((await getTicket(noToken.deps, 'CB-1')).stages[0]?.content).toBeNull()

    const failing = createTestContext()
    seedTicket(failing, 'CB-1', { stage: 'design' })
    failing.codeHost.failures.readFile = new CodeHostError(0, 'offline')
    expect((await getTicket(failing.deps, 'CB-1')).stages[0]?.content).toBeNull()
  })

  it('returns the log and the open question', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { state: 'awaiting_answer' })
    const run = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'plan', trigger: 'initial', model: 'm', input: { model: 'm', previousRuns: [] } })
    ctx.deps.runs.complete(run.id, {
      output: { type: 'question', question: 'Wer?' }, costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0,
    })
    ctx.deps.audit.append({ ticketKey: 'CB-1', actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' } })

    const detail = await getTicket(ctx.deps, 'CB-1')

    expect(detail.pendingQuestion).toBe('Wer?')
    expect(detail.log).toEqual([{ actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' }, createdAt: expect.any(Date) }])
  })

  it('has no open question outside awaiting_answer', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')
    expect((await getTicket(ctx.deps, 'CB-1')).pendingQuestion).toBeNull()
  })

  it('accepts lower-case keys and reports unknown ones', async () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1')
    expect((await getTicket(ctx.deps, 'cb-1')).key).toBe('CB-1')
    await expect(getTicket(ctx.deps, 'CB-404')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('getSettings', () => {
  it('reports the target repository and whether a token is configured', () => {
    expect(getSettings(createTestContext().deps)).toEqual({ repoUrl: 'https://github.com/o/r', tokenConfigured: true })
    expect(getSettings(createTestContext({ token: false }).deps).tokenConfigured).toBe(false)
  })
})
```

- [ ] **Step 3: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/application/queries.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementieren**

`packages/core/src/application/messages.ts`:

```ts
/** Shown when a stage is started without `GITHUB_TOKEN`. */
export const TOKEN_MISSING = 'GITHUB_TOKEN fehlt — ohne Token kann die App keine Branches und PRs anlegen (siehe README).'
```

`packages/core/src/application/describeError.ts`:

```ts
/** User-facing text of any thrown value; prefers git's stderr where present. */
export function describeError(err: unknown): string {
  const stderr = (err as { stderr?: Buffer } | null)?.stderr?.toString().trim()
  return stderr || (err instanceof Error ? err.message : String(err))
}
```

`packages/core/src/application/reporter.ts` (ersetzt die Datei):

```ts
import type { Stage, TicketState } from '../domain/types'
import type { UseCaseDeps } from './deps'

/** Per-ticket helpers that keep server log, events and state changes consistent. */
export interface Reporter {
  /** Server log line only. */
  log(message: string): void
  /** Progress event only. */
  progress(message: string): void
  /** Server log line plus progress event. */
  report(message: string): void
  /** Persists the state (and stage, if given) and publishes a state event. */
  setState(state: TicketState, stage?: Stage): void
  question(question: string): void
}

export function createReporter(deps: Pick<UseCaseDeps, 'tickets' | 'events'>, ticketKey: string): Reporter {
  const log = (message: string) => console.log(`[${new Date().toISOString()}] [${ticketKey}] ${message}`)
  const progress = (message: string) => deps.events.publish({ type: 'progress', ticketKey, message })

  return {
    log,
    progress,
    report: (message) => {
      log(message)
      progress(message)
    },
    setState: (state, stage) => {
      const ticket = deps.tickets.update(ticketKey, stage ? { stage, state } : { state })
      deps.events.publish({ type: 'state', ticketKey, stage: ticket.stage, state: ticket.state })
    },
    question: (question) => deps.events.publish({ type: 'question', ticketKey, question }),
  }
}
```

`packages/core/src/application/failStage.ts`:

```ts
import type { UseCaseDeps } from './deps'
import type { Reporter } from './reporter'

/** Ends a stage attempt as `failed`: server log, progress event and a log entry for the ticket page. */
export function failStage(deps: Pick<UseCaseDeps, 'audit'>, reporter: Reporter, ticketKey: string, message: string): void {
  reporter.log(`ERROR: ${message}`)
  reporter.progress(`Fehler: ${message}`)
  deps.audit.append({ ticketKey, actor: 'system', type: 'error', payload: { message } })
  reporter.setState('failed')
}
```

`packages/core/src/application/requireTicket.ts` (ersetzt die Datei):

```ts
import type { Ticket } from '../domain/types'
import type { TicketRepository } from '../ports'
import { NotFoundError } from '../domain/errors'

/**
 * Resolves a ticket key from a URL or action; case-insensitive (`cb-3` → `CB-3`).
 * @throws {NotFoundError} for unknown keys.
 */
export function requireTicket(tickets: TicketRepository, key: string): Ticket {
  const ticket = tickets.findByKey(key.trim().toUpperCase())
  if (!ticket) throw new NotFoundError(`Ticket ${key} nicht gefunden`)
  return ticket
}
```

`packages/core/src/application/dto.ts` (ersetzt die Datei):

```ts
import type { AuditEventDto, PullRequestRefDto, TicketDto } from '@refinement/shared'
import type { Artifact, Ticket } from '../domain/types'
import type { AuditEvent } from '../ports'

export function toPullRequestRef(artifact: Artifact): PullRequestRefDto {
  return { number: artifact.prNumber, url: artifact.prUrl, state: artifact.prState }
}

/** @param openArtifact - Artifact of the current stage whose PR is still open. */
export function toTicketDto(ticket: Ticket, openArtifact: Artifact | null): TicketDto {
  return {
    key: ticket.key,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    sourcePath: ticket.sourcePath,
    stage: ticket.stage,
    state: ticket.state,
    openPr: openArtifact ? toPullRequestRef(openArtifact) : null,
    updatedAt: ticket.updatedAt,
  }
}

/** The ticket key is implied by the page and therefore omitted. */
export function toAuditEventDto(event: AuditEvent): AuditEventDto {
  return { actor: event.actor, type: event.type, payload: event.payload, createdAt: event.createdAt }
}
```

`packages/core/src/application/queries.ts` (ersetzt die Datei):

```ts
import type { SettingsDto, StageViewDto, TicketDetailDto, TicketDto } from '@refinement/shared'
import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { artifactPath, fileUrl } from '../domain/artifacts'
import { currentArtifactStage, isStageCompleted } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { toAuditEventDto, toPullRequestRef, toTicketDto } from './dto'
import { describeError } from './describeError'
import { requireTicket } from './requireTicket'

const ARTIFACT_STAGES: readonly ArtifactStage[] = ['plan', 'design']

function openArtifact(deps: UseCaseDeps, ticket: Ticket): Artifact | null {
  const stage = currentArtifactStage(ticket)
  return stage ? deps.artifacts.findOpen(ticket.key, stage) : null
}

export function listTickets(deps: UseCaseDeps): TicketDto[] {
  return deps.tickets.list().map((ticket) => toTicketDto(ticket, openArtifact(deps, ticket)))
}

/** Content of a merged artifact, read live from the default branch; null without token or on errors. */
async function readMergedContent(deps: UseCaseDeps, path: string): Promise<string | null> {
  if (!deps.codeHost) return null
  try {
    return await deps.codeHost.readFile(path)
  } catch (err) {
    console.warn(`[getTicket] ${path} nicht lesbar: ${describeError(err)}`)
    return null
  }
}

async function stageView(deps: UseCaseDeps, ticket: Ticket, artifacts: Artifact[], stage: ArtifactStage): Promise<StageViewDto> {
  const path = artifactPath(ticket.key, stage)
  const latest = artifacts.filter((a) => a.stage === stage).at(-1) ?? null
  const completed = isStageCompleted(ticket, stage)
  return {
    stage,
    path,
    fileUrl: fileUrl(deps.repoUrl, path),
    completed,
    pr: latest ? toPullRequestRef(latest) : null,
    mergedAt: latest?.mergedAt ?? null,
    content: completed ? await readMergedContent(deps, path) : null,
  }
}

/** The agent's question while the ticket waits for an answer. */
function pendingQuestion(deps: UseCaseDeps, ticket: Ticket): string | null {
  const stage = currentArtifactStage(ticket)
  if (ticket.state !== 'awaiting_answer' || !stage) return null
  const output = deps.runs.listForTicket(ticket.key, stage).at(-1)?.output
  return output?.type === 'question' ? output.question : null
}

export async function getTicket(deps: UseCaseDeps, key: string): Promise<TicketDetailDto> {
  const ticket = requireTicket(deps.tickets, key)
  const artifacts = deps.artifacts.listForTicket(ticket.key)
  return {
    ...toTicketDto(ticket, openArtifact(deps, ticket)),
    stages: await Promise.all(ARTIFACT_STAGES.map((stage) => stageView(deps, ticket, artifacts, stage))),
    log: deps.audit.listForTicket(ticket.key).map(toAuditEventDto),
    pendingQuestion: pendingQuestion(deps, ticket),
  }
}

export function getSettings(deps: UseCaseDeps): SettingsDto {
  return { repoUrl: deps.repoUrl, tokenConfigured: deps.codeHost !== null }
}
```

- [ ] **Step 5: Test grün**

Run: `cd packages/core && npx vitest run src/application/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A packages/core/src/application
git commit -m "feat(core): Abfragen für Board, Ticketseite und Einstellungen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Anwendung — Stufe starten, Agent laufen lassen, PR öffnen

**Files:**
- Create: `packages/core/src/application/stageCommands.ts`, `runStage.ts`, `publishArtifact.ts`, `stageCommands.test.ts`
- Replace: `packages/core/src/application/executeRun.ts`

Ablauf (Spec §5): `startStage` prüft, setzt `running` und gibt den Job an `runInBackground`. Der Job aktualisiert den Klon, holt die Codebase-Übersicht, ruft den Agent, legt bei einer Rückfrage `awaiting_answer` fest, sonst rendert er `intent.md`, löscht einen übrig gebliebenen Branch, legt Branch + Datei + PR an, speichert das Artefakt und setzt `in_review`. Ein Stop setzt `ready` sofort (Task 16); jedes später eintreffende Ergebnis wird verworfen, solange das Ticket nicht mehr `running` ist.

- [ ] **Step 1: Test schreiben** — `packages/core/src/application/stageCommands.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRunTerminatedError, AgentRunTimeoutError, CodeHostError } from '../ports'
import { SAMPLE_META, createTestContext, errorCodeOf, seedTicket, type TestContext } from '../testing/fakes'
import { startStage } from './stageCommands'

const MODEL = { model: 'claude-sonnet-4-6' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function start(ctx: TestContext, key = 'CB-2') {
  startStage(ctx.deps, key, MODEL)
  await ctx.settle()
  return ctx.deps.tickets.findByKey(key)!
}

function setup(patch: Parameters<typeof seedTicket>[2] = {}) {
  const ctx = createTestContext()
  seedTicket(ctx, 'CB-2', { title: 'Lesezeit bei Artikeln anzeigen', ...patch })
  return ctx
}

describe('startStage — success', () => {
  it('writes the intent on its own branch, opens the PR and waits for review', async () => {
    const ctx = setup()

    expect(await start(ctx)).toMatchObject({ stage: 'plan', state: 'in_review' })

    const file = ctx.codeHost.branches.get('CB-2/intent')?.get('docs/work/CB-2/intent.md')
    expect(file).toContain('ticket: CB-2\nstage: plan\nsource: examples/tickets/cb-2.md')
    expect(file).toContain('# CB-2: Lesezeit anzeigen')
    expect(ctx.codeHost.pulls[0]).toMatchObject({ number: 1, headBranch: 'CB-2/intent', title: 'CB-2: Intent', state: 'open' })
    expect(ctx.codeHost.pulls[0]?.body).toContain('„Lesezeit bei Artikeln anzeigen“')
    expect(ctx.deps.artifacts.findOpen('CB-2', 'plan')).toMatchObject({ prNumber: 1, branch: 'CB-2/intent', path: 'docs/work/CB-2/intent.md' })
  })

  it('runs the plan agent on the updated clone', async () => {
    const ctx = setup()
    ctx.repos.summary = 'Express + Prisma'
    await start(ctx)
    expect(ctx.repos.requestedUrls).toEqual(['https://github.com/o/r'])
    expect(ctx.agent.calls[0]).toMatchObject({
      ticketKey: 'CB-2', stage: 'plan', title: 'Lesezeit bei Artikeln anzeigen', model: 'claude-sonnet-4-6',
      repoPath: '/repo', codebaseSummary: 'Express + Prisma', previousRuns: [],
    })
  })

  it('logs run and PR and publishes the state changes', async () => {
    const ctx = setup()
    await start(ctx)

    expect(ctx.store.audit.map((e) => e.type)).toEqual(['run_started', 'run_finished', 'pr_opened'])
    expect(ctx.store.audit[0]?.payload).toMatchObject({ stage: 'plan', trigger: 'initial', model: 'claude-sonnet-4-6' })
    expect(ctx.store.audit[1]?.payload).toMatchObject({
      status: 'succeeded', model: 'm', durationSeconds: 1, costUsd: 0.001, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5,
    })
    expect(ctx.store.audit[2]?.payload).toEqual({ prNumber: 1, prUrl: 'https://github.com/o/r/pull/1', branch: 'CB-2/intent' })
    expect(ctx.events.published.flatMap((e) => (e.type === 'state' ? [e.state] : []))).toEqual(['running', 'in_review'])
    expect(ctx.store.runs[0]).toMatchObject({ stage: 'plan', trigger: 'initial', status: 'succeeded', input: { model: 'claude-sonnet-4-6', previousRuns: [] } })
  })

  it('replaces a branch left over from an earlier attempt', async () => {
    const ctx = setup()
    ctx.codeHost.branches.set('CB-2/intent', new Map([['old.md', 'x']]))
    await start(ctx)
    expect([...ctx.codeHost.branches.get('CB-2/intent')!.keys()]).toEqual(['docs/work/CB-2/intent.md'])
    expect(ctx.codeHost.calls.indexOf('deleteBranch')).toBeLessThan(ctx.codeHost.calls.indexOf('createBranch'))
  })

  it('waits for an answer when the agent asks', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: { type: 'question', question: 'Gilt das auch für Entwürfe?' }, meta: SAMPLE_META }

    expect(await start(ctx)).toMatchObject({ state: 'awaiting_answer' })
    expect(ctx.events.published).toContainEqual({ type: 'question', ticketKey: 'CB-2', question: 'Gilt das auch für Entwürfe?' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'question_asked', actor: 'agent', payload: { question: 'Gilt das auch für Entwürfe?' } })
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('starts again after a failure', async () => {
    const ctx = setup({ state: 'failed' })
    expect(await start(ctx)).toMatchObject({ state: 'in_review' })
  })
})

describe('startStage — failures', () => {
  it('fails with the GitHub message when the PR cannot be opened; the run itself succeeded', async () => {
    const ctx = setup()
    ctx.codeHost.failures.openPullRequest = new CodeHostError(403, 'PR für CB-2/intent öffnen: Rechte fehlen')

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', actor: 'system', payload: { message: 'PR für CB-2/intent öffnen: Rechte fehlen' } })
    expect(ctx.store.runs[0]?.status).toBe('succeeded')
    expect(ctx.deps.artifacts.listForTicket('CB-2')).toEqual([])
  })

  it('fails when the repository cannot be cloned', async () => {
    const ctx = setup()
    ctx.repos.ensureRepoError = new Error('could not resolve host')

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.audit.at(-1)?.payload).toEqual({ message: 'Repository konnte nicht geladen werden. (could not resolve host)' })
    expect(ctx.agent.calls).toEqual([])
  })

  it('records a timeout', async () => {
    const ctx = setup()
    ctx.agent.outcome = new AgentRunTimeoutError(5)

    expect(await start(ctx)).toMatchObject({ state: 'failed' })
    expect(ctx.store.runs[0]?.status).toBe('timeout')
    expect(ctx.store.audit.map((e) => e.type)).toEqual(['run_started', 'run_finished', 'error'])
  })

  it('returns to ready when the agent is terminated', async () => {
    const ctx = setup()
    ctx.agent.outcome = new AgentRunTerminatedError()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    // The real stop sets `ready` before the process ends (Task 16); simulate that order.
    ctx.deps.tickets.update('CB-2', { state: 'ready' })
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.store.audit.map((e) => e.type)).not.toContain('error')
  })
})

describe('startStage — rejected', () => {
  it('rejects unknown tickets, invalid input and wrong states', () => {
    const ctx = createTestContext()
    seedTicket(ctx, 'CB-1', { state: 'running' })
    seedTicket(ctx, 'CB-2', { state: 'in_review' })
    seedTicket(ctx, 'CB-3', { state: 'awaiting_answer' })
    seedTicket(ctx, 'CB-4', { stage: 'design' })
    seedTicket(ctx, 'CB-5', { stage: 'done' })
    seedTicket(ctx, 'CB-6')

    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-404', MODEL))).toBe('NOT_FOUND')
    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-6', { model: '' }))).toBe('VALIDATION')
    for (const key of ['CB-1', 'CB-2', 'CB-3', 'CB-4', 'CB-5']) {
      expect(errorCodeOf(() => startStage(ctx.deps, key, MODEL))).toBe('CONFLICT')
    }
    expect(ctx.agent.calls).toEqual([])
  })

  it('rejects the start without token and says why', () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1')
    expect(errorCodeOf(() => startStage(ctx.deps, 'CB-1', MODEL))).toBe('CONFLICT')
    expect(() => startStage(ctx.deps, 'CB-1', MODEL)).toThrow('GITHUB_TOKEN')
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
  })
})
```

Zum Test „terminated“: Ein echter Stop setzt `ready`, bevor der Agent-Prozess endet. Der Test hält den Agent an, setzt den Zustand direkt auf `ready` und lässt ihn dann mit `AgentRunTerminatedError` enden.

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/application/stageCommands.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`packages/core/src/application/publishArtifact.ts`:

```ts
import type { ArtifactStage, Ticket } from '../domain/types'
import { artifactPath, artifactTitle, branchName } from '../domain/artifacts'
import { renderPullRequestBody } from '../domain/render'
import type { UseCaseDeps } from './deps'
import { TOKEN_MISSING } from './messages'
import { createReporter } from './reporter'

/**
 * Proposes the artifact via its own branch and PR, records it and moves the ticket to `in_review`.
 * A branch left over from an earlier attempt is replaced.
 * @throws {CodeHostError} when a GitHub step fails — the caller marks the stage failed.
 */
export async function publishArtifact(
  deps: UseCaseDeps,
  ticket: Ticket,
  stage: ArtifactStage,
  artifact: { markdown: string; summary: string },
): Promise<void> {
  const host = deps.codeHost
  if (!host) throw new Error(TOKEN_MISSING)

  const branch = branchName(ticket.key, stage)
  const path = artifactPath(ticket.key, stage)
  const title = artifactTitle(ticket.key, stage)

  await host.deleteBranch(branch)
  await host.createBranch(branch)
  await host.commitFile({ branch, path, content: artifact.markdown, message: title })
  const pr = await host.openPullRequest({ branch, title, body: renderPullRequestBody(ticket, stage, artifact.summary) })

  deps.artifacts.create({ ticketKey: ticket.key, stage, path, branch, prNumber: pr.number, prUrl: pr.url })
  deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'pr_opened', payload: { prNumber: pr.number, prUrl: pr.url, branch } })
  createReporter(deps, ticket.key).setState('in_review')
}
```

`packages/core/src/application/executeRun.ts` (ersetzt die Datei):

```ts
import type { ArtifactStage, QAPair, RunTrigger, Ticket } from '../domain/types'
import { renderIntent } from '../domain/render'
import { AgentRunTerminatedError, AgentRunTimeoutError } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { failStage } from './failStage'
import { publishArtifact } from './publishArtifact'

export interface StageRunRequest {
  stage: ArtifactStage
  trigger: RunTrigger
  model: string
  /** Answered questions so far; empty for the first run. */
  previousRuns: QAPair[]
}

export interface ExecuteRunRequest extends StageRunRequest {
  repoDir: string
  codebaseSummary: string | null
}

/**
 * Creates a run, executes the agent and applies its outcome: question → `awaiting_answer`,
 * intent → branch + PR → `in_review`. Never throws.
 * A stop sets the ticket to `ready` while the agent may still answer; such late results are discarded.
 */
export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const stillRunning = () => deps.tickets.findByKey(ticket.key)?.state === 'running'
  let runId: string | undefined

  /** Ends the run as failed/timeout once; skipped after a reset removed the ticket. */
  const finishRun = (status: 'failed' | 'timeout') => {
    if (runId === undefined || !deps.tickets.findByKey(ticket.key)) return
    deps.runs.fail(runId, status)
    deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'run_finished', payload: { runId, status } })
    runId = undefined
  }

  try {
    const run = deps.runs.create({
      ticketKey: ticket.key, stage: request.stage, trigger: request.trigger, model: request.model,
      input: { model: request.model, previousRuns: request.previousRuns },
    })
    runId = run.id
    deps.audit.append({
      ticketKey: ticket.key, actor: 'system', type: 'run_started',
      payload: { runId, stage: request.stage, trigger: request.trigger, model: request.model },
    })

    const { output, meta } = await deps.agent.run(
      {
        ticketKey: ticket.key,
        stage: request.stage,
        title: ticket.title,
        description: ticket.description,
        repoPath: request.repoDir,
        model: request.model,
        codebaseSummary: request.codebaseSummary ?? undefined,
        previousRuns: request.previousRuns,
      },
      reporter.report,
    )

    if (!stillRunning()) {
      reporter.log('Agent result discarded: the run was stopped')
      finishRun('failed')
      return
    }

    reporter.log(`Claude finished in ${meta.durationSeconds}s ($${meta.costUsd.toFixed(4)})`)
    deps.runs.complete(runId, {
      output,
      costUsd: meta.costUsd,
      inputTokens: meta.inputTokens,
      cacheCreationTokens: meta.cacheCreationTokens,
      cacheReadTokens: meta.cacheReadTokens,
      outputTokens: meta.outputTokens,
    })
    deps.audit.append({
      ticketKey: ticket.key, actor: 'agent', type: 'run_finished',
      payload: {
        runId, status: 'succeeded', model: meta.model, durationSeconds: meta.durationSeconds, costUsd: meta.costUsd,
        inputTokens: meta.inputTokens, cacheCreationTokens: meta.cacheCreationTokens,
        cacheReadTokens: meta.cacheReadTokens, outputTokens: meta.outputTokens,
      },
    })
    runId = undefined

    if (output.type === 'question') {
      deps.audit.append({ ticketKey: ticket.key, actor: 'agent', type: 'question_asked', payload: { question: output.question } })
      reporter.setState('awaiting_answer')
      reporter.question(output.question)
      return
    }

    reporter.progress('Intent wird als Pull Request angelegt...')
    await publishArtifact(deps, ticket, request.stage, {
      markdown: renderIntent(ticket, output.result, request.previousRuns),
      summary: output.result.problem,
    })
  } catch (err) {
    if (err instanceof AgentRunTerminatedError || !stillRunning()) {
      reporter.log('Agent run stopped')
      finishRun('failed')
      return
    }
    finishRun(err instanceof AgentRunTimeoutError ? 'timeout' : 'failed')
    failStage(deps, reporter, ticket.key, describeError(err))
  }
}
```

`packages/core/src/application/runStage.ts`:

```ts
import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { executeRun, type StageRunRequest } from './executeRun'
import { failStage } from './failStage'

/**
 * Background job of `startStage` and `answerQuestion`: update the clone → codebase summary → agent run.
 * Never throws. Stops early when the ticket was stopped while the clone was prepared.
 */
export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: StageRunRequest): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  const stillRunning = () => deps.tickets.findByKey(ticket.key)?.state === 'running'
  reporter.log(`Starting stage ${request.stage} (${request.trigger}) for "${ticket.title}"`)

  reporter.progress('Repository wird vorbereitet...')
  let repoDir: string
  try {
    repoDir = await deps.repos.ensureRepo(deps.repoUrl)
  } catch (err) {
    if (stillRunning()) failStage(deps, reporter, ticket.key, `Repository konnte nicht geladen werden. (${describeError(err)})`)
    return
  }

  const codebaseSummary = await deps.repos.ensureSummary(repoDir, request.model, reporter.report)
  if (!codebaseSummary) reporter.progress('Codebase-Analyse nicht verfügbar — Agent startet ohne Übersicht.')
  if (!stillRunning()) return

  reporter.progress('Agent wird gestartet...')
  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary })
}
```

`packages/core/src/application/stageCommands.ts`:

```ts
import { StartStageInput } from '@refinement/shared'
import { ConflictError } from '../domain/errors'
import { canStartStage, currentArtifactStage } from '../domain/rules'
import type { UseCaseDeps } from './deps'
import { TOKEN_MISSING } from './messages'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { runStage } from './runStage'

/** Validates, sets `running` and hands the stage to the background. Returns immediately. */
export function startStage(deps: UseCaseDeps, key: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, key)
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canStartStage(ticket)) {
    throw new ConflictError(`Stufe kann im Zustand ${ticket.stage}/${ticket.state} nicht gestartet werden`)
  }
  const { model } = parseInput(StartStageInput, raw)

  createReporter(deps, ticket.key).setState('running')
  deps.runInBackground(runStage(deps, ticket, { stage, trigger: 'initial', model, previousRuns: [] }))
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/application/stageCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application
git commit -m "feat(core): Stufe starten — Agent, Intent-Datei, Branch und PR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 16: Anwendung — Rückfrage beantworten und Lauf stoppen

**Files:**
- Modify: `packages/core/src/application/stageCommands.ts`, `packages/core/src/application/stageCommands.test.ts`

- [ ] **Step 1: Tests ergänzen** — in `stageCommands.test.ts` den Import ändern und am Dateiende anhängen:

Import-Zeilen oben ersetzen durch:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRunTerminatedError, AgentRunTimeoutError, CodeHostError } from '../ports'
import { SAMPLE_INTENT_OUTPUT, SAMPLE_META, createTestContext, errorCodeOf, seedTicket, type TestContext } from '../testing/fakes'
import { answerQuestion, startStage, stopRun } from './stageCommands'
```

Am Dateiende:

```ts
async function askQuestion(ctx: TestContext): Promise<void> {
  ctx.agent.outcome = { output: { type: 'question', question: 'Wer?' }, meta: SAMPLE_META }
  startStage(ctx.deps, 'CB-2', MODEL)
  await ctx.settle()
  ctx.agent.outcome = { output: SAMPLE_INTENT_OUTPUT, meta: SAMPLE_META }
}

describe('answerQuestion', () => {
  it('continues the stage with the Q&A history and documents the answer in the intent', async () => {
    const ctx = setup()
    await askQuestion(ctx)

    answerQuestion(ctx.deps, 'CB-2', { answer: 'Alle Leser' })
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('running')
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.agent.calls[1]).toMatchObject({ model: 'claude-sonnet-4-6', previousRuns: [{ question: 'Wer?', answer: 'Alle Leser' }] })
    expect(ctx.store.runs[1]).toMatchObject({ trigger: 'answer', seq: 2 })
    expect(ctx.codeHost.branches.get('CB-2/intent')?.get('docs/work/CB-2/intent.md')).toContain('**F:** Wer?\\\n**A:** Alle Leser')
    expect(ctx.store.audit.find((e) => e.type === 'answer_given')).toMatchObject({ actor: 'human', payload: { answer: 'Alle Leser' } })
  })

  it('rejects a second answer while the first one runs', async () => {
    const ctx = setup()
    await askQuestion(ctx)
    answerQuestion(ctx.deps, 'CB-2', { answer: 'A' })
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'B' }))).toBe('CONFLICT')
    await ctx.settle()
  })

  it('rejects answers without an open question, blank answers and unknown tickets', async () => {
    const ctx = setup()
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'A' }))).toBe('CONFLICT')
    await askQuestion(ctx)
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: '  ' }))).toBe('VALIDATION')
    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-404', { answer: 'A' }))).toBe('NOT_FOUND')
  })

  it('rejects answers without token', () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-2', { state: 'awaiting_answer' })
    expect(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'A' })).toThrow('GITHUB_TOKEN')
  })
})

describe('stopRun', () => {
  it('stops a running agent and returns the ticket to ready at once', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))

    stopRun(ctx.deps, 'CB-2')

    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.agent.stopped).toEqual(['CB-2'])
    release()
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.store.runs[0]?.status).toBe('failed')
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('cancels the job when stopped while the clone is prepared', async () => {
    const ctx = setup()
    startStage(ctx.deps, 'CB-2', MODEL)
    stopRun(ctx.deps, 'CB-2')
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.agent.calls).toEqual([])
  })

  it('discards a result that arrives after the stop', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))
    ctx.deps.tickets.update('CB-2', { state: 'ready' }) // stopped, but the agent did not react to the signal
    release()
    await ctx.settle()
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
    expect(ctx.codeHost.pulls).toEqual([])
  })

  it('drops an open question', async () => {
    const ctx = setup()
    await askQuestion(ctx)
    stopRun(ctx.deps, 'CB-2')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('ready')
  })

  it('ignores unknown tickets and tickets without a run', () => {
    const ctx = setup({ state: 'in_review' })
    expect(() => stopRun(ctx.deps, 'CB-404')).not.toThrow()
    stopRun(ctx.deps, 'CB-2')
    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
    expect(ctx.agent.stopped).toEqual([])
  })
})
```

- [ ] **Step 2: Tests fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/application/stageCommands.test.ts`
Expected: FAIL (`answerQuestion`, `stopRun` fehlen).

- [ ] **Step 3: Implementieren** — `packages/core/src/application/stageCommands.ts` vollständig:

```ts
import { AnswerInput, StartStageInput } from '@refinement/shared'
import { ConflictError, errorCode } from '../domain/errors'
import { canAnswer, canStartStage, canStop, currentArtifactStage, planAnswerRun } from '../domain/rules'
import type { Ticket } from '../domain/types'
import type { UseCaseDeps } from './deps'
import { TOKEN_MISSING } from './messages'
import { parseInput } from './validation'
import { requireTicket } from './requireTicket'
import { createReporter } from './reporter'
import { runStage } from './runStage'

/** Validates, sets `running` and hands the stage to the background. Returns immediately. */
export function startStage(deps: UseCaseDeps, key: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, key)
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canStartStage(ticket)) {
    throw new ConflictError(`Stufe kann im Zustand ${ticket.stage}/${ticket.state} nicht gestartet werden`)
  }
  const { model } = parseInput(StartStageInput, raw)

  createReporter(deps, ticket.key).setState('running')
  deps.runInBackground(runStage(deps, ticket, { stage, trigger: 'initial', model, previousRuns: [] }))
}

/**
 * Continues the stage with the answer in a new run (same model, full Q&A history). Returns immediately.
 * The ticket is `running` right away, so a second answer is rejected.
 */
export function answerQuestion(deps: UseCaseDeps, key: string, raw: unknown): void {
  const ticket = requireTicket(deps.tickets, key)
  const stage = currentArtifactStage(ticket)
  if (!stage || !canAnswer(ticket)) throw new ConflictError('Ticket wartet nicht auf eine Antwort')
  if (!deps.codeHost) throw new ConflictError(TOKEN_MISSING)
  const { answer } = parseInput(AnswerInput, raw)
  const plan = planAnswerRun(deps.runs.listForTicket(ticket.key, stage), answer)
  if (!plan) throw new ConflictError('Keine offene Rückfrage gefunden')

  deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'answer_given', payload: { answer } })
  createReporter(deps, ticket.key).setState('running')
  deps.runInBackground(runStage(deps, ticket, {
    stage, trigger: 'answer', model: plan.questionRun.input.model, previousRuns: plan.previousRuns,
  }))
}

/**
 * Stops the agent and returns a running or waiting ticket to `ready` at once.
 * Idempotent: unknown tickets and tickets without a run are ignored.
 */
export function stopRun(deps: UseCaseDeps, key: string): void {
  let ticket: Ticket
  try {
    ticket = requireTicket(deps.tickets, key)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') return
    throw err
  }
  if (!canStop(ticket)) return
  deps.agent.stop(ticket.key)
  createReporter(deps, ticket.key).setState('ready')
}
```

- [ ] **Step 4: Tests grün**

Run: `cd packages/core && npx vitest run src/application/stageCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/stageCommands.ts packages/core/src/application/stageCommands.test.ts
git commit -m "feat(core): Rückfrage beantworten und Lauf stoppen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

> **Nachtrag nach Review (Commit `ed1c3b7`):** Der Code aus Task 15/16 wurde nach der Review geändert. Ein Versuch hat jetzt eine Identität: `startStage`/`answerQuestion` legen den Agent-Lauf sofort an (`application/beginRun.ts`: `beginRun`, `isCurrentRun`, `finishRun`). Jobs prüfen `isCurrentRun` statt nur `state === 'running'`; `publishArtifact` prüft nach dem Öffnen des PRs erneut und schließt ihn, wenn der Versuch inzwischen veraltet ist. Damit sind Stop → Neustart, Stop während der PR-Anlage und Reset während eines Laufs ohne Wettlauf. Maßgeblich ist der Code im Repo, nicht die Blöcke in Task 15/16.

---

## Task 17: Anwendung — PR-Status abgleichen (`syncReviews`)

**Files:**
- Create: `packages/core/src/application/syncReviews.ts`, `packages/core/src/application/syncReviews.test.ts`

Verhalten (Spec §5 und §8): für Tickets in `in_review` den PR lesen. Gemergt → Artefakt `merged`, nächste Stufe, `ready`. Ohne Merge geschlossen → Branch löschen, `closed`, `ready`. PR gibt es nicht mehr (404) → `ready` und Log-Eintrag. Andere GitHub-Fehler → Zustand bleibt, Warnung, nächster Abgleich versucht es erneut.

- [ ] **Step 1: Test schreiben** — `packages/core/src/application/syncReviews.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { startStage } from './stageCommands'
import { syncReviews } from './syncReviews'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Runs stage 1 for the ticket, so it ends `in_review` with an open PR. */
async function inReview(ctx: TestContext, key: string): Promise<number> {
  seedTicket(ctx, key)
  startStage(ctx.deps, key, { model: 'm' })
  await ctx.settle()
  return ctx.deps.artifacts.findOpen(key, 'plan')!.prNumber
}

describe('syncReviews', () => {
  it('moves a merged intent to stage design', async () => {
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    const mergedAt = new Date('2026-10-28T12:00:00Z')
    ctx.codeHost.merge(pr, mergedAt)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.deps.artifacts.listForTicket('CB-1')[0]).toMatchObject({ prState: 'merged', mergedAt })
    expect(ctx.store.audit.slice(-2)).toMatchObject([
      { type: 'pr_merged', actor: 'human', payload: { prNumber: pr } },
      { type: 'stage_changed', actor: 'system', payload: { from: 'plan', to: 'design' } },
    ])
    expect(ctx.events.published.at(-1)).toEqual({ type: 'state', ticketKey: 'CB-1', stage: 'design', state: 'ready' })
  })

  it('returns a PR closed without merge to ready and deletes its branch', async () => {
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    ctx.codeHost.pulls[0]!.state = 'closed'

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'plan', state: 'ready' })
    expect(ctx.codeHost.branches.has('CB-1/intent')).toBe(false)
    expect(ctx.deps.artifacts.findOpen('CB-1', 'plan')).toBeNull()
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'pr_closed', payload: { prNumber: pr } })
  })

  it('leaves open PRs untouched', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
  })

  it('keeps the state on GitHub errors and retries next time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = createTestContext()
    const pr = await inReview(ctx, 'CB-1')
    ctx.codeHost.failures.getPullRequest = new CodeHostError(0, 'offline')

    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
    expect(warn).toHaveBeenCalled()

    delete ctx.codeHost.failures.getPullRequest
    ctx.codeHost.merge(pr)
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.stage).toBe('design')
  })

  it('returns to ready when the PR no longer exists', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    ctx.codeHost.pulls.splice(0)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(ctx.deps.artifacts.findOpen('CB-1', 'plan')).toBeNull()
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', payload: { message: 'PR #1 gibt es nicht mehr' } })
  })

  it('checks only the given ticket', async () => {
    const ctx = createTestContext()
    await inReview(ctx, 'CB-1')
    await inReview(ctx, 'CB-2')
    ctx.codeHost.calls.length = 0

    await syncReviews(ctx.deps, 'cb-2')

    expect(ctx.codeHost.calls).toEqual(['getPullRequest'])
  })

  it('does nothing without token', async () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    await syncReviews(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('in_review')
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/application/syncReviews.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — `packages/core/src/application/syncReviews.ts`:

```ts
import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
import { currentArtifactStage, nextStage } from '../domain/rules'
import { CodeHostError, type CodeHost, type PullRequest } from '../ports'
import type { UseCaseDeps } from './deps'
import { createReporter } from './reporter'
import { describeError } from './describeError'
import { requireTicket } from './requireTicket'

const NOT_FOUND = 404

/**
 * Applies what happened to the PRs of tickets in review (all, or the one given):
 * merged → next stage; closed without merge → branch deleted, `ready`.
 * GitHub errors leave the ticket as it is; the next sync retries. Never throws for GitHub errors.
 * @throws {NotFoundError} for an unknown `key`.
 */
export async function syncReviews(deps: UseCaseDeps, key?: string): Promise<void> {
  const host = deps.codeHost
  const tickets = key ? [requireTicket(deps.tickets, key)] : deps.tickets.list()
  if (!host) return

  for (const ticket of tickets) {
    const stage = currentArtifactStage(ticket)
    if (ticket.state !== 'in_review' || !stage) continue
    const artifact = deps.artifacts.findOpen(ticket.key, stage)
    if (!artifact) {
      createReporter(deps, ticket.key).setState('ready')
      continue
    }
    await syncOne(deps, host, ticket, stage, artifact)
  }
}

async function syncOne(deps: UseCaseDeps, host: CodeHost, ticket: Ticket, stage: ArtifactStage, artifact: Artifact): Promise<void> {
  const reporter = createReporter(deps, ticket.key)
  let pr: PullRequest
  try {
    pr = await host.getPullRequest(artifact.prNumber)
  } catch (err) {
    if (err instanceof CodeHostError && err.status === NOT_FOUND) {
      deps.artifacts.markClosed(artifact.id)
      deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'error', payload: { message: `PR #${artifact.prNumber} gibt es nicht mehr` } })
      reporter.setState('ready')
    } else {
      console.warn(`[syncReviews] ${ticket.key}: ${describeError(err)}`)
    }
    return
  }

  // A concurrent sync (timer and page) may have handled the ticket while we waited.
  if (deps.tickets.findByKey(ticket.key)?.state !== 'in_review') return

  if (pr.state === 'merged') {
    deps.artifacts.markMerged(artifact.id, pr.mergedAt ?? new Date())
    deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'pr_merged', payload: { prNumber: pr.number } })
    const next = nextStage(stage)
    deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'stage_changed', payload: { from: stage, to: next } })
    reporter.setState('ready', next)
  } else if (pr.state === 'closed') {
    try {
      await host.deleteBranch(artifact.branch)
    } catch (err) {
      console.warn(`[syncReviews] ${ticket.key}: Branch ${artifact.branch} nicht gelöscht: ${describeError(err)}`)
    }
    deps.artifacts.markClosed(artifact.id)
    deps.audit.append({ ticketKey: ticket.key, actor: 'human', type: 'pr_closed', payload: { prNumber: pr.number } })
    reporter.setState('ready')
  }
}
```

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/application/syncReviews.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/syncReviews.ts packages/core/src/application/syncReviews.test.ts
git commit -m "feat(core): PR-Status abgleichen — Merge ist der Übergang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 18: Anwendung — Start der App und Reset

**Files:**
- Replace: `packages/core/src/application/startup.ts`, `packages/core/src/application/startup.test.ts`

Ablauf (Spec §3): (1) unterbrochene Läufe beenden, `running` → `ready`; (2) Tickets aus der Quelle übernehmen; ohne Token hier Schluss (Warnung). Mit Token: (3) `syncReviews` übernimmt Merges, die während der Downtime passiert sind; (4) offene PRs der App schließen und ihre Branches löschen; (5) Stufe aus den Dateien auf dem Default-Branch ableiten. GitHub-Fehler in (3)–(5) → Warnung, weiter mit DB-Stand. `resetSystem` stoppt laufende Agents, leert die DB und startet neu.

- [ ] **Step 1: Test schreiben** — `packages/core/src/application/startup.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeHostError } from '../ports'
import { createTestContext, seedTicket, sourceTicket, type TestContext } from '../testing/fakes'
import { resetSystem, startup } from './startup'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function withSource(ctx: TestContext, ...keys: string[]): TestContext {
  ctx.source.tickets = keys.map((key) => sourceTicket(key))
  return ctx
}

describe('startup — tickets', () => {
  it('imports the tickets of the source as plan/ready and logs the import', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    await startup(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([['CB-1', 'plan', 'ready'], ['CB-2', 'plan', 'ready']])
    expect(ctx.store.audit).toMatchObject([
      { ticketKey: 'CB-1', type: 'ticket_imported', payload: { sourcePath: 'examples/tickets/cb-1.md' } },
      { ticketKey: 'CB-2', type: 'ticket_imported' },
    ])
  })

  it('updates the text of known tickets but keeps stage and state (no token)', async () => {
    const ctx = createTestContext({ token: false })
    seedTicket(ctx, 'CB-1', { stage: 'design', state: 'failed' })
    ctx.source.tickets = [sourceTicket('CB-1', { title: 'Neuer Titel' })]
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ title: 'Neuer Titel', stage: 'design', state: 'failed' })
    expect(ctx.store.audit).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN'))
  })

  it('ends runs interrupted by a restart and returns their tickets to ready', async () => {
    const ctx = withSource(createTestContext({ token: false }), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'running' })
    const run = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'plan', trigger: 'initial', model: 'm', input: { model: 'm', previousRuns: [] } })

    await startup(ctx.deps)

    expect(ctx.deps.runs.findById(run.id)?.status).toBe('failed')
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(ctx.store.audit[0]).toMatchObject({ type: 'run_finished', payload: { runId: run.id, status: 'failed', reason: 'Neustart' } })
  })
})

describe('startup — GitHub', () => {
  it('closes the open PRs of the app and deletes their branches; other PRs stay', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    const appPr = ctx.codeHost.seedPullRequest('CB-1/intent')
    const foreignPr = ctx.codeHost.seedPullRequest('feature/x')
    const unknownTicketPr = ctx.codeHost.seedPullRequest('CB-9/intent')

    await startup(ctx.deps)

    expect(appPr.state).toBe('closed')
    expect(ctx.codeHost.branches.has('CB-1/intent')).toBe(false)
    expect(foreignPr.state).toBe('open')
    expect(unknownTicketPr.state).toBe('open')
    expect(ctx.store.audit.at(-1)).toMatchObject({ ticketKey: 'CB-1', type: 'cleanup', payload: { prNumber: appPr.number, branch: 'CB-1/intent' } })
  })

  it('derives the stage from the files on the default branch', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2', 'CB-3')
    ctx.codeHost.files.set('docs/work/CB-1/intent.md', 'x')
    ctx.codeHost.files.set('docs/work/CB-2/intent.md', 'x')
    ctx.codeHost.files.set('docs/work/CB-2/spec.md', 'x')

    await startup(ctx.deps)

    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([
      ['CB-1', 'design', 'ready'], ['CB-2', 'done', 'ready'], ['CB-3', 'plan', 'ready'],
    ])
    expect(ctx.store.audit.filter((e) => e.type === 'stage_changed')).toHaveLength(2)
  })

  it('applies a merge that happened while the app was down', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'in_review' })
    await ctx.codeHost.createBranch('CB-1/intent')
    await ctx.codeHost.commitFile({ branch: 'CB-1/intent', path: 'docs/work/CB-1/intent.md', content: 'x', message: 'm' })
    const pr = await ctx.codeHost.openPullRequest({ branch: 'CB-1/intent', title: 'CB-1: Intent', body: '' })
    ctx.deps.artifacts.create({ ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent', prNumber: pr.number, prUrl: pr.url })
    ctx.codeHost.merge(pr.number)

    await startup(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-1')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.deps.artifacts.listForTicket('CB-1')[0]?.prState).toBe('merged')
  })

  it('keeps an open question across the restart', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    seedTicket(ctx, 'CB-1', { state: 'awaiting_answer' })
    await startup(ctx.deps)
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('awaiting_answer')
  })

  it('continues with the database state when GitHub fails', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    ctx.codeHost.failures.listOpenPullRequests = new CodeHostError(0, 'offline')
    await expect(startup(ctx.deps)).resolves.toBeUndefined()
    expect(ctx.deps.tickets.findByKey('CB-1')?.state).toBe('ready')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'))
  })
})

describe('resetSystem', () => {
  it('stops running agents, empties the database and starts again', async () => {
    const ctx = withSource(createTestContext(), 'CB-1', 'CB-2')
    seedTicket(ctx, 'CB-1', { stage: 'design', state: 'running' })
    ctx.deps.audit.append({ ticketKey: 'CB-1', actor: 'system', type: 'cleanup' })

    await resetSystem(ctx.deps)

    expect(ctx.agent.stopped).toEqual(['CB-1'])
    expect(ctx.deps.tickets.list().map((t) => [t.key, t.stage, t.state])).toEqual([['CB-1', 'plan', 'ready'], ['CB-2', 'plan', 'ready']])
    expect(ctx.store.audit.map((e) => e.type)).toEqual(['ticket_imported', 'ticket_imported'])
  })

  it('picks up a new ticket file', async () => {
    const ctx = withSource(createTestContext(), 'CB-1')
    await startup(ctx.deps)
    ctx.source.tickets.push(sourceTicket('CB-4'))
    await resetSystem(ctx.deps)
    expect(ctx.deps.tickets.list().map((t) => t.key)).toEqual(['CB-1', 'CB-4'])
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/application/startup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren** — `packages/core/src/application/startup.ts` (ersetzt die Datei):

```ts
import { artifactPath, parseAppBranch } from '../domain/artifacts'
import { reconcile, stageFromRepo } from '../domain/rules'
import type { CodeHost } from '../ports'
import type { UseCaseDeps } from './deps'
import { describeError } from './describeError'
import { sleep } from './sleep'
import { syncReviews } from './syncReviews'

/**
 * Start of the app (spec §3), before requests are served. Without token, or when GitHub fails,
 * the app continues with the database state and logs a warning.
 */
export async function startup(deps: UseCaseDeps): Promise<void> {
  endInterruptedRuns(deps)
  importTickets(deps)

  const host = deps.codeHost
  if (!host) {
    console.warn('[startup] GITHUB_TOKEN fehlt — Abgleich mit GitHub übersprungen')
    return
  }
  try {
    await syncReviews(deps)
    await closeOpenPullRequests(deps, host)
    await deriveStages(deps, host)
  } catch (err) {
    console.warn(`[startup] GitHub-Abgleich fehlgeschlagen, weiter mit DB-Stand: ${describeError(err)}`)
  }
}

/** Stops running agents, empties the database and runs the start again. */
export async function resetSystem(deps: UseCaseDeps): Promise<void> {
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') deps.agent.stop(ticket.key)
  }
  await sleep(deps.stopSettleMs)
  deps.tickets.clear()
  await startup(deps)
}

/** Runs still `running` were cut off by the restart; their tickets start over as `ready`. */
function endInterruptedRuns(deps: UseCaseDeps): void {
  for (const run of deps.runs.findStuck()) {
    deps.runs.fail(run.id, 'failed')
    deps.audit.append({ ticketKey: run.ticketKey, actor: 'system', type: 'run_finished', payload: { runId: run.id, status: 'failed', reason: 'Neustart' } })
  }
  for (const ticket of deps.tickets.list()) {
    if (ticket.state === 'running') deps.tickets.update(ticket.key, { state: 'ready' })
  }
}

function importTickets(deps: UseCaseDeps): void {
  const items = deps.source.list()
  const created = new Set(deps.tickets.upsertFromSource(items))
  for (const item of items) {
    if (created.has(item.key)) {
      deps.audit.append({ ticketKey: item.key, actor: 'system', type: 'ticket_imported', payload: { sourcePath: item.sourcePath } })
    }
  }
  console.log(`[startup] ${items.length} Ticket(s) gelesen, ${created.size} neu`)
}

/** Closes every open PR of the app (head branch `<KEY>/intent|spec` of a known ticket) and deletes its branch. */
async function closeOpenPullRequests(deps: UseCaseDeps, host: CodeHost): Promise<void> {
  const keys = new Set(deps.tickets.list().map((t) => t.key))
  for (const pr of await host.listOpenPullRequests()) {
    const owner = parseAppBranch(pr.headBranch, keys)
    if (!owner) continue
    await host.closePullRequest(pr.number)
    await host.deleteBranch(pr.headBranch)
    const artifact = deps.artifacts.findOpen(owner.key, owner.stage)
    if (artifact) deps.artifacts.markClosed(artifact.id)
    deps.audit.append({ ticketKey: owner.key, actor: 'system', type: 'cleanup', payload: { prNumber: pr.number, branch: pr.headBranch } })
  }
}

/** Sets each ticket to the stage its merged artifacts on the default branch imply. */
async function deriveStages(deps: UseCaseDeps, host: CodeHost): Promise<void> {
  for (const ticket of deps.tickets.list()) {
    const [intent, spec] = await Promise.all([
      host.readFile(artifactPath(ticket.key, 'plan')),
      host.readFile(artifactPath(ticket.key, 'design')),
    ])
    const next = reconcile(ticket, stageFromRepo({ hasIntent: intent !== null, hasSpec: spec !== null }))
    if (next.stage !== ticket.stage) {
      deps.audit.append({ ticketKey: ticket.key, actor: 'system', type: 'stage_changed', payload: { from: ticket.stage, to: next.stage } })
    }
    if (next.stage !== ticket.stage || next.state !== ticket.state) deps.tickets.update(ticket.key, next)
  }
}
```

`application/sleep.ts` bleibt unverändert.

- [ ] **Step 4: Test grün**

Run: `cd packages/core && npx vitest run src/application/startup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application/startup.ts packages/core/src/application/startup.test.ts
git commit -m "feat(core): Start der App — Tickets einlesen, PRs aufräumen, Stufe ableiten

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 19: Kern zusammensetzen — Use Cases, Komposition, Exporte

**Files:**
- Replace: `packages/core/src/application/createUseCases.ts`, `packages/core/src/compose.ts`, `packages/core/src/compose.test.ts`, `packages/core/src/index.ts`

- [ ] **Step 1: Test schreiben** — `packages/core/src/compose.test.ts` (ersetzt die Datei):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRefinementEngine, resolveCorePaths } from './compose'

const CORE_DIR = path.resolve(__dirname, '..')
const ROOT_DIR = path.resolve(CORE_DIR, '..', '..')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveCorePaths', () => {
  it('points to the shipped migrations and skills', () => {
    const paths = resolveCorePaths(CORE_DIR)
    expect(fs.existsSync(path.join(paths.migrationsFolder, 'meta', '_journal.json'))).toBe(true)
    expect(fs.existsSync(path.join(paths.skillsDir, 'intent-agent.md'))).toBe(true)
  })
})

describe('createRefinementEngine', () => {
  it('creates the database, imports the example tickets and runs without token', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-'))
    const engine = createRefinementEngine({
      dbPath: path.join(dir, 'nested', 'refinement.db'),
      ...resolveCorePaths(CORE_DIR),
      ticketsDir: path.join(ROOT_DIR, 'examples', 'tickets'),
      rootDir: ROOT_DIR,
      targetRepo: 'https://github.com/o/r',
    })

    await engine.startup()

    expect(engine.listTickets().map((t) => t.key)).toEqual(['CB-1', 'CB-2', 'CB-3'])
    expect(engine.getSettings()).toEqual({ repoUrl: 'https://github.com/o/r', tokenConfigured: false })
    expect(() => engine.startStage('CB-1', { model: 'm' })).toThrow('GITHUB_TOKEN')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd packages/core && npx vitest run src/compose.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`packages/core/src/application/createUseCases.ts` (ersetzt die Datei):

```ts
import type { SettingsDto, TicketDetailDto, TicketDto, TicketEvent } from '@refinement/shared'
import type { UseCaseDeps } from './deps'
import { getSettings, getTicket, listTickets } from './queries'
import { answerQuestion, startStage, stopRun } from './stageCommands'
import { syncReviews } from './syncReviews'
import { resetSystem, startup } from './startup'

/**
 * Everything a driving adapter (Next.js) may call.
 * Inputs typed `unknown` are validated inside; domain errors carry `code` (see `errorCode`).
 */
export interface UseCases {
  listTickets(): TicketDto[]
  getTicket(key: string): Promise<TicketDetailDto>
  getSettings(): SettingsDto
  startStage(key: string, input: unknown): void
  answerQuestion(key: string, input: unknown): void
  stopRun(key: string): void
  /** Checks the PRs of tickets in review — all, or the one given. */
  syncReviews(key?: string): Promise<void>
  resetSystem(): Promise<void>
  /** Events of one ticket, or of all tickets with `null`. */
  subscribe(ticketKey: string | null, handler: (event: TicketEvent) => void): () => void
  startup(): Promise<void>
}

export function createUseCases(deps: UseCaseDeps): UseCases {
  return {
    listTickets: () => listTickets(deps),
    getTicket: (key) => getTicket(deps, key),
    getSettings: () => getSettings(deps),
    startStage: (key, input) => startStage(deps, key, input),
    answerQuestion: (key, input) => answerQuestion(deps, key, input),
    stopRun: (key) => stopRun(deps, key),
    syncReviews: (key) => syncReviews(deps, key),
    resetSystem: () => resetSystem(deps),
    subscribe: (ticketKey, handler) => deps.events.subscribe(ticketKey, handler),
    startup: () => startup(deps),
  }
}
```

`packages/core/src/compose.ts` (ersetzt die Datei):

```ts
import path from 'path'
import { createUseCases, type UseCases } from './application/createUseCases'
import { createSqliteDatabase } from './adapters/sqlite/database'
import { createSqliteTicketRepository } from './adapters/sqlite/ticketRepository'
import { createSqliteAgentRunRepository } from './adapters/sqlite/agentRunRepository'
import { createSqliteArtifactRepository } from './adapters/sqlite/artifactRepository'
import { createSqliteAuditLog } from './adapters/sqlite/auditLog'
import { createMarkdownTicketSource } from './adapters/markdownTickets/markdownTicketSource'
import { createGitHubCodeHost } from './adapters/github/githubCodeHost'
import { createClaudeCliAgentRunner } from './adapters/claudeCli'
import { createGitRepoProvider } from './adapters/git/repoCache'
import { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'

export interface EngineConfig {
  /** SQLite file; parent directories are created. */
  dbPath: string
  /** `packages/core/drizzle` */
  migrationsFolder: string
  /** `packages/core/skills` */
  skillsDir: string
  /** Directory with the ticket files (`examples/tickets`). */
  ticketsDir: string
  /** Repository root; ticket source paths are shown relative to it. */
  rootDir: string
  /** Target repository on GitHub (`TARGET_REPO`). */
  targetRepo: string
  /** Fine-grained PAT (`GITHUB_TOKEN`); without it stages cannot be started. */
  githubToken?: string
}

const STOP_SETTLE_MS = 500

/**
 * Paths of the assets shipped with this package. Passed in from the app because bundlers
 * (Next.js) relocate the code, so `__dirname` inside the package is not reliable.
 * @param coreDir - Absolute path to `packages/core`.
 */
export function resolveCorePaths(coreDir: string): Pick<EngineConfig, 'migrationsFolder' | 'skillsDir'> {
  return {
    migrationsFolder: path.join(coreDir, 'drizzle'),
    skillsDir: path.join(coreDir, 'skills'),
  }
}

/** Composition of the production adapters. Call once per process and keep the result. */
export function createRefinementEngine(config: EngineConfig): UseCases {
  const db = createSqliteDatabase({ path: config.dbPath, migrationsFolder: config.migrationsFolder })
  return createUseCases({
    tickets: createSqliteTicketRepository(db),
    runs: createSqliteAgentRunRepository(db),
    artifacts: createSqliteArtifactRepository(db),
    audit: createSqliteAuditLog(db),
    source: createMarkdownTicketSource({ dir: config.ticketsDir, rootDir: config.rootDir }),
    codeHost: config.githubToken ? createGitHubCodeHost({ repoUrl: config.targetRepo, token: config.githubToken }) : null,
    agent: createClaudeCliAgentRunner({ skillsDir: config.skillsDir }),
    repos: createGitRepoProvider(),
    events: createNodeEventPublisher(),
    repoUrl: config.targetRepo,
    runInBackground: (task) => {
      task.catch((err) => console.error('[background] unhandled error in agent run', err))
    },
    stopSettleMs: STOP_SETTLE_MS,
  })
}
```

`packages/core/src/index.ts` (ersetzt die Datei):

```ts
export { createRefinementEngine, resolveCorePaths } from './compose'
export type { EngineConfig } from './compose'

export { createUseCases } from './application/createUseCases'
export type { UseCases } from './application/createUseCases'
export type { UseCaseDeps } from './application/deps'

export { NotFoundError, ConflictError, ValidationError, errorCode } from './domain/errors'
export type { DomainErrorCode } from './domain/errors'
export type { Ticket, SourceTicket, AgentRun, AgentRunInput, Artifact, QAPair } from './domain/types'

export * from './ports'

export { createNodeEventPublisher } from './adapters/nodeEvents/nodeEventPublisher'
```

- [ ] **Step 4: Kern komplett grün**

```bash
cd packages/core
npx vitest run src/compose.test.ts
npm test
npm run build
npm run lint
```

Expected: alle Kern-Tests PASS, `tsc --noEmit` ohne Fehler, ESLint ohne Fehler. Bei Typfehlern in Testdateien (z. B. `as any` in alten Hilfen) den Fehler im betroffenen Test beheben, nicht im Produktionscode abschwächen. `rg -n "formatTicketId|parseTicketId|SEED_TICKETS|RefinementEvent|startRefinement|subscribeToTicket" packages/core/src` muss leer sein.

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src
git commit -m "feat(core): Use Cases und Komposition für die Playbook-Stufen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 20: Web — Engine-Konfiguration, Start, Actions, SSE

**Files:**
- Replace: `apps/web/lib/container.ts`, `apps/web/instrumentation.ts`, `apps/web/app/actions.ts`, `apps/web/app/actions.test.ts`, `apps/web/app/api/events/route.ts`, `apps/web/app/api/events/route.test.ts`, `apps/web/hooks/useSSE.ts`, `apps/web/hooks/useSSE.test.tsx`

- [ ] **Step 1: Tests schreiben**

`apps/web/app/actions.test.ts` (ersetzt die Datei):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictError } from '@refinement/core'

const engine = vi.hoisted(() => ({
  startStage: vi.fn(),
  answerQuestion: vi.fn(),
  stopRun: vi.fn(),
  resetSystem: vi.fn(),
}))

vi.mock('@/lib/container', () => ({ getEngine: () => engine }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { answerQuestionAction, resetSystemAction, startStageAction, stopRunAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('server actions', () => {
  it('passes key and input through and refreshes the whole layout', async () => {
    expect(await startStageAction('CB-2', { model: 'm' })).toEqual({ ok: true, data: undefined })
    await answerQuestionAction('CB-2', { answer: 'Alle Leser' })
    await stopRunAction('CB-2')
    expect(engine.startStage).toHaveBeenCalledWith('CB-2', { model: 'm' })
    expect(engine.answerQuestion).toHaveBeenCalledWith('CB-2', { answer: 'Alle Leser' })
    expect(engine.stopRun).toHaveBeenCalledWith('CB-2')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('awaits the reset', async () => {
    engine.resetSystem.mockResolvedValue(undefined)
    expect(await resetSystemAction()).toEqual({ ok: true, data: undefined })
  })

  it('reports domain errors as a failed result', async () => {
    engine.startStage.mockImplementation(() => {
      throw new ConflictError('GITHUB_TOKEN fehlt')
    })
    expect(await startStageAction('CB-2', { model: 'm' })).toEqual({ ok: false, error: 'GITHUB_TOKEN fehlt' })
  })
})
```

`apps/web/app/api/events/route.test.ts` (ersetzt die Datei):

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

type Handler = (event: { ticketKey: string }) => void

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: { ticketKey: string }) => void>>()
  const ALL = '*'
  return {
    subscribe(ticketKey: string | null, handler: (event: { ticketKey: string }) => void) {
      const name = ticketKey ?? ALL
      if (!handlers.has(name)) handlers.set(name, new Set())
      handlers.get(name)!.add(handler)
      return () => { handlers.get(name)!.delete(handler) }
    },
    publish(event: { ticketKey: string }) {
      handlers.get(event.ticketKey)?.forEach((handler) => handler(event))
      handlers.get(ALL)?.forEach((handler) => handler(event))
    },
    count: (ticketKey: string | null) => handlers.get(ticketKey ?? ALL)?.size ?? 0,
  }
})

vi.mock('@/lib/container', () => ({
  getEngine: () => ({ subscribe: (key: string | null, h: Handler) => bus.subscribe(key, h) }),
}))

import { GET } from './route'

const decoder = new TextDecoder()

describe('GET /api/events', () => {
  it('streams a ping, then the events of one ticket', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-1', { signal: controller.signal }))
    expect(res.headers.get('content-type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')

    bus.publish({ type: 'progress', ticketKey: 'CB-2', message: 'other' } as never)
    bus.publish({ type: 'progress', ticketKey: 'CB-1', message: 'hi' } as never)
    expect(decoder.decode((await reader.read()).value)).toBe('data: {"type":"progress","ticketKey":"CB-1","message":"hi"}\n\n')
    controller.abort()
  })

  it('streams the events of all tickets without ticketKey (board)', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events', { signal: controller.signal }))
    const reader = res.body!.getReader()
    await reader.read()

    bus.publish({ type: 'state', ticketKey: 'CB-7', stage: 'plan', state: 'running' } as never)
    expect(decoder.decode((await reader.read()).value)).toContain('"ticketKey":"CB-7"')
    controller.abort()
  })

  it('unsubscribes and ends the stream when the client disconnects', async () => {
    const controller = new AbortController()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-3', { signal: controller.signal }))
    const reader = res.body!.getReader()
    await reader.read()
    expect(bus.count('CB-3')).toBe(1)

    controller.abort()

    expect(bus.count('CB-3')).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })

  it('does not stay subscribed when the request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const res = GET(new Request('http://localhost/api/events?ticketKey=CB-5', { signal: controller.signal }))
    expect(bus.count('CB-5')).toBe(0)
    const reader = res.body!.getReader()
    expect(decoder.decode((await reader.read()).value)).toBe(': ok\n\n')
    expect((await reader.read()).done).toBe(true)
  })
})
```

`apps/web/hooks/useSSE.test.tsx` (ersetzt die Datei):

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
  it('connects to the stream of one ticket', () => {
    renderHook(() => useSSE('CB-1', { onMessage: vi.fn() }))
    expect(latest().url).toBe('/api/events?ticketKey=CB-1')
  })

  it('connects to the stream of all tickets with null', () => {
    renderHook(() => useSSE(null, { onMessage: vi.fn() }))
    expect(latest().url).toBe('/api/events')
  })

  it('passes every parsed event to onMessage and marks the connection', () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => useSSE('CB-1', { onMessage }))

    act(() => {
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketKey: 'CB-1', message: 'a' }) })
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketKey: 'CB-1', message: 'b' }) })
    })

    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'progress', ticketKey: 'CB-1', message: 'a' })
    expect(onMessage).toHaveBeenNthCalledWith(2, { type: 'progress', ticketKey: 'CB-1', message: 'b' })
    expect(result.current).toEqual({ connected: true, everConnected: true })
  })

  it('calls onReconnect only when the connection opens again', () => {
    const onReconnect = vi.fn()
    renderHook(() => useSSE('CB-1', { onMessage: vi.fn(), onReconnect }))

    act(() => latest().onopen?.())
    expect(onReconnect).not.toHaveBeenCalled()
    act(() => latest().onopen?.())
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('reports a lost connection but remembers that it was connected', () => {
    const { result } = renderHook(() => useSSE('CB-1', { onMessage: vi.fn() }))
    act(() => latest().onopen?.())
    act(() => latest().onerror?.())
    expect(result.current).toEqual({ connected: false, everConnected: true })
  })

  it('closes the connection on unmount and when the ticket changes', () => {
    const { rerender, unmount } = renderHook(({ key }) => useSSE(key, { onMessage: vi.fn() }), {
      initialProps: { key: 'CB-1' },
    })
    const first = latest()
    rerender({ key: 'CB-2' })
    expect(first.closed).toBe(true)
    expect(latest().url).toBe('/api/events?ticketKey=CB-2')
    unmount()
    expect(latest().closed).toBe(true)
  })
})
```

- [ ] **Step 2: Tests fehlschlagen sehen**

Run: `cd apps/web && npx vitest run app/actions.test.ts app/api/events hooks/useSSE.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`apps/web/lib/container.ts` (ersetzt die Datei):

```ts
import 'server-only'
import path from 'path'
import { createRefinementEngine, resolveCorePaths, type UseCases } from '@refinement/core'

/** Fork of the RealWorld example backend; override with `TARGET_REPO` in `apps/web/.env.local`. */
const DEFAULT_TARGET_REPO = 'https://github.com/wojciechlaka/node-express-realworld-example-app'

const globalForEngine = globalThis as typeof globalThis & { __refinementEngine?: UseCases }

/**
 * Composition root of the web app: one engine per process.
 * Kept on globalThis because Next.js loads modules into several bundles (pages, actions,
 * route handlers) and reloads them in dev — all must share the same database connection,
 * event bus and running agent processes. `startup()` runs in `instrumentation.ts`.
 */
export function getEngine(): UseCases {
  if (!globalForEngine.__refinementEngine) {
    // `next dev` / `next start` run with apps/web as working directory (npm -w).
    const rootDir = path.resolve(process.cwd(), '..', '..')
    globalForEngine.__refinementEngine = createRefinementEngine({
      dbPath: process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'refinement.db'),
      ...resolveCorePaths(path.join(rootDir, 'packages', 'core')),
      ticketsDir: path.join(rootDir, 'examples', 'tickets'),
      rootDir,
      targetRepo: process.env.TARGET_REPO || DEFAULT_TARGET_REPO,
      githubToken: process.env.GITHUB_TOKEN || undefined,
    })
  }
  return globalForEngine.__refinementEngine
}
```

`apps/web/instrumentation.ts` (ersetzt die Datei):

```ts
/** A local app receives no GitHub webhooks, so it polls the PRs of tickets in review. */
const SYNC_INTERVAL_MS = 60_000

/**
 * Runs once when the Next.js server starts, before the first request: migrations, ticket import,
 * clean-up of open app PRs and stage derivation (see `startup` in packages/core). Then starts
 * the review sync timer.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { getEngine } = await import('./lib/container')
  const engine = getEngine()
  await engine.startup()

  const timer = setInterval(() => {
    engine.syncReviews().catch((err) => console.warn('[sync] PR-Abgleich fehlgeschlagen', err))
  }, SYNC_INTERVAL_MS)
  timer.unref()
}
```

`apps/web/app/actions.ts` (ersetzt die Datei):

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getEngine } from '@/lib/container'
import { runAction, type ActionResult } from '@/lib/actionResult'

/** Board and ticket pages both show ticket state — refresh the whole tree. */
function refreshAll(): void {
  revalidatePath('/', 'layout')
}

export async function startStageAction(key: string, input: { model: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().startStage(key, input))
  refreshAll()
  return result
}

export async function answerQuestionAction(key: string, input: { answer: string }): Promise<ActionResult> {
  const result = await runAction(() => getEngine().answerQuestion(key, input))
  refreshAll()
  return result
}

export async function stopRunAction(key: string): Promise<ActionResult> {
  const result = await runAction(() => getEngine().stopRun(key))
  refreshAll()
  return result
}

export async function resetSystemAction(): Promise<ActionResult> {
  const result = await runAction(() => getEngine().resetSystem())
  refreshAll()
  return result
}
```

`apps/web/app/api/events/route.ts` (ersetzt die Datei):

```ts
import { getEngine } from '@/lib/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const encoder = new TextEncoder()

/**
 * Server-Sent Events: `GET /api/events?ticketKey=CB-1` for one ticket, `GET /api/events` for all
 * tickets (board). One subscription per connection; it is removed when the browser disconnects.
 */
export function GET(request: Request): Response {
  const ticketKey = new URL(request.url).searchParams.get('ticketKey')

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
      unsubscribe = getEngine().subscribe(ticketKey, (event) => {
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

`apps/web/hooks/useSSE.ts`: drei Änderungen am Bestand.

1. Import `RefinementEvent` → `TicketEvent`:

```ts
import type { TicketEvent } from '@refinement/shared'
```

und in `SSEHandlers` `onMessage: (event: TicketEvent) => void`; in `es.onmessage` `JSON.parse(e.data) as TicketEvent`.

2. Signatur und Doku:

```ts
/**
 * Subscribes to `/api/events?ticketKey=<key>`, or to all tickets with `null` (board).
 * EventSource reconnects automatically.
 * ...(rest of the existing comment unchanged)
 */
export function useSSE(ticketKey: string | null, handlers: SSEHandlers) {
```

3. URL, Warnung und Effekt-Abhängigkeit:

```ts
    const url = ticketKey ? `/api/events?ticketKey=${encodeURIComponent(ticketKey)}` : '/api/events'
    const es = new EventSource(url)
```

```ts
      console.warn('SSE error', ticketKey ?? 'all tickets')
```

```ts
  }, [ticketKey])
```

- [ ] **Step 4: Tests grün**

Run: `cd apps/web && npx vitest run app/actions.test.ts app/api/events hooks/useSSE.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/container.ts apps/web/instrumentation.ts apps/web/app/actions.ts apps/web/app/actions.test.ts apps/web/app/api/events apps/web/hooks
git commit -m "feat(web): Ziel-Repo als Server-Konfiguration, Start mit Abgleich-Timer, Actions und SSE

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 21: Web — Board nach Stufen und Seitenleiste

**Files:**
- Replace: `apps/web/lib/constants.ts`, `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/components/Sidebar.tsx`, `apps/web/components/ResetButton.tsx`, `apps/web/components/AppStateProvider.tsx`
- Create: `apps/web/components/Board.tsx`, `BoardLive.tsx`, `TicketCard.tsx`, `Board.test.tsx`
- Delete: `apps/web/components/CreateTicketDialog.tsx`, `CreateTicketDialog.test.tsx`, `RepoSettings.tsx`, `TicketList.tsx`

- [ ] **Step 1: Test schreiben** — `apps/web/components/Board.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import type { TicketDto } from '@refinement/shared'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

import { Board } from './Board'

const NOW = new Date('2026-10-28T10:00:00Z')

function ticket(key: string, patch: Partial<TicketDto> = {}): TicketDto {
  return {
    key, title: `Titel ${key}`, description: 'D', priority: 'Mittel', sourcePath: `examples/tickets/${key}.md`,
    stage: 'plan', state: 'ready', openPr: null, updatedAt: NOW, ...patch,
  }
}

describe('Board', () => {
  it('groups the tickets into the stage columns', () => {
    render(<Board tickets={[ticket('CB-1'), ticket('CB-2', { stage: 'design' }), ticket('CB-3', { stage: 'done' })]} />)
    expect(within(screen.getByRole('region', { name: '1 Plan' })).getByText('Titel CB-1')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '2 Design' })).getByText('Titel CB-2')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fertig' })).getByText('Titel CB-3')).toBeInTheDocument()
  })

  it('shows key, priority, state and the PR number in review', () => {
    render(<Board tickets={[
      ticket('CB-1', { state: 'in_review', openPr: { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open' } }),
      ticket('CB-2', { state: 'awaiting_answer', priority: null }),
    ]} />)
    expect(screen.getByText('in Review: PR #3')).toBeInTheDocument()
    expect(screen.getByText('Rückfrage')).toBeInTheDocument()
    expect(screen.getByText('CB-1')).toBeInTheDocument()
    expect(screen.getAllByText('Mittel')).toHaveLength(1)
  })

  it('links each card to its ticket page', () => {
    render(<Board tickets={[ticket('CB-1')]} />)
    expect(screen.getByRole('link', { name: /Titel CB-1/ })).toHaveAttribute('href', '/tickets/CB-1')
  })

  it('shows empty columns', () => {
    render(<Board tickets={[]} />)
    expect(screen.getAllByText('Keine Tickets')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `cd apps/web && npx vitest run components/Board.test.tsx`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren**

`apps/web/lib/constants.ts` (ersetzt die Datei):

```ts
import type { Stage, TicketDto, TicketState } from '@refinement/shared'

export const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const STAGE_LABEL: Record<Stage, string> = {
  plan:   '1 Plan',
  design: '2 Design',
  done:   'Fertig',
}

export const STATE_LABEL: Record<TicketState, string> = {
  ready:           'bereit',
  running:         'Agent läuft',
  awaiting_answer: 'Rückfrage',
  in_review:       'in Review',
  failed:          'fehlgeschlagen',
}

export const STATE_VARIANT: Record<TicketState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ready:           'outline',
  running:         'secondary',
  awaiting_answer: 'default',
  in_review:       'default',
  failed:          'destructive',
}

/** State label; in review it names the PR. */
export function stateText(ticket: Pick<TicketDto, 'state' | 'openPr'>): string {
  return ticket.state === 'in_review' && ticket.openPr ? `in Review: PR #${ticket.openPr.number}` : STATE_LABEL[ticket.state]
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

`apps/web/components/TicketCard.tsx`:

```tsx
import Link from 'next/link'
import type { TicketDto } from '@refinement/shared'
import { STATE_VARIANT, stateText } from '@/lib/constants'
import { Badge } from './ui/badge'

/** Board card: key, priority, title and — until the ticket is done — its state. */
export function TicketCard({ ticket }: { ticket: TicketDto }) {
  return (
    <Link
      href={`/tickets/${ticket.key}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-400"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-mono">{ticket.key}</span>
        {ticket.priority && <span>{ticket.priority}</span>}
      </div>
      <div className="mt-1 text-sm font-medium">{ticket.title}</div>
      {ticket.stage !== 'done' && (
        <Badge variant={STATE_VARIANT[ticket.state]} className="mt-2 text-xs">
          {stateText(ticket)}
        </Badge>
      )}
    </Link>
  )
}
```

`apps/web/components/Board.tsx`:

```tsx
import type { Stage, TicketDto } from '@refinement/shared'
import { STAGE_LABEL } from '@/lib/constants'
import { TicketCard } from './TicketCard'

const COLUMNS: readonly Stage[] = ['plan', 'design', 'done']

/** Tickets grouped by playbook stage. */
export function Board({ tickets }: { tickets: TicketDto[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
      {COLUMNS.map((stage) => {
        const column = tickets.filter((ticket) => ticket.stage === stage)
        return (
          <section key={stage} aria-label={STAGE_LABEL[stage]} className="rounded-xl bg-slate-50 p-3">
            <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-600">
              {STAGE_LABEL[stage]}
              <span className="text-xs font-normal text-slate-400">{column.length}</span>
            </h2>
            <div className="space-y-2">
              {column.map((ticket) => <TicketCard key={ticket.key} ticket={ticket} />)}
              {column.length === 0 && <p className="text-xs text-slate-400">Keine Tickets</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

`apps/web/components/BoardLive.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useSSE } from '@/hooks/useSSE'

/** Keeps the server-rendered board current: a state change of any ticket refreshes it. */
export function BoardLive() {
  const router = useRouter()
  useSSE(null, {
    onMessage: (event) => {
      if (event.type === 'state') router.refresh()
    },
    onReconnect: () => router.refresh(),
  })
  return null
}
```

`apps/web/app/page.tsx` (ersetzt die Datei):

```tsx
import { getEngine } from '@/lib/container'
import { Board } from '@/components/Board'
import { BoardLive } from '@/components/BoardLive'

export default function BoardPage() {
  return (
    <>
      <BoardLive />
      <Board tickets={getEngine().listTickets()} />
    </>
  )
}
```

`apps/web/components/Sidebar.tsx` (ersetzt die Datei):

```tsx
import Link from 'next/link'
import type { SettingsDto } from '@refinement/shared'
import { Separator } from './ui/separator'
import { ResetButton } from './ResetButton'

/** Navigation, target repository (from `TARGET_REPO`, read-only) and reset. */
export function Sidebar({ settings }: { settings: SettingsDto }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200">
      <Link href="/" className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900">
        Board
      </Link>
      <Separator />
      <div className="space-y-1 border-b border-slate-200 p-3">
        <p className="text-xs text-slate-500">Ziel-Repository</p>
        <a href={settings.repoUrl} target="_blank" rel="noreferrer" className="block break-all font-mono text-xs text-slate-700 hover:underline">
          {settings.repoUrl.replace('https://github.com/', '')}
        </a>
        {!settings.tokenConfigured && (
          <p role="status" className="text-xs text-amber-700">
            Token fehlt — GITHUB_TOKEN in apps/web/.env.local setzen (siehe README).
          </p>
        )}
      </div>
      <div className="p-3">
        <ResetButton />
      </div>
    </aside>
  )
}
```

`apps/web/components/ResetButton.tsx` (ersetzt die Datei):

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetSystemAction } from '@/app/actions'
import { useAppState } from './AppStateProvider'

/** Empties the database and runs the start again (ticket import, PR clean-up, stage derivation). */
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
      className="btn-ghost-xs"
      title="Datenbank leeren und Tickets aus examples/tickets neu einlesen"
    >
      {pending ? 'Setze zurück...' : 'Reset'}
    </button>
  )
}
```

`apps/web/components/AppStateProvider.tsx` (ersetzt die Datei — das Repo kommt jetzt vom Server):

```tsx
'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface AppState {
  progressLogs: Record<string, string[]>
  appendProgress(ticketKey: string, message: string): void
  clearProgress(): void
}

const AppStateContext = createContext<AppState | null>(null)

/**
 * Client state that must survive navigation between tickets: the live progress log per ticket.
 * Lives in the root layout, which App Router keeps mounted across navigations.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [progressLogs, setProgressLogs] = useState<Record<string, string[]>>({})

  const appendProgress = useCallback((ticketKey: string, message: string) => {
    setProgressLogs((prev) => ({ ...prev, [ticketKey]: [...(prev[ticketKey] ?? []), message] }))
  }, [])

  const clearProgress = useCallback(() => setProgressLogs({}), [])

  const value = useMemo(() => ({ progressLogs, appendProgress, clearProgress }), [progressLogs, appendProgress, clearProgress])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
```

`apps/web/app/layout.tsx` (ersetzt die Datei):

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
  description: 'Tickets durch die Playbook-Stufen Plan und Design führen',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AppStateProvider>
          <div className="flex h-screen bg-white text-slate-900">
            <Sidebar settings={getEngine().getSettings()} />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  )
}
```

Alte Komponenten löschen:

```bash
git rm apps/web/components/CreateTicketDialog.tsx apps/web/components/CreateTicketDialog.test.tsx \
       apps/web/components/RepoSettings.tsx apps/web/components/TicketList.tsx
```

- [ ] **Step 4: Test grün**

Run: `cd apps/web && npx vitest run components/Board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/lib/constants.ts apps/web/app/page.tsx apps/web/app/layout.tsx apps/web/components
git commit -m "feat(web): Board nach Stufen, Seitenleiste mit Ziel-Repo und Token-Hinweis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 22: Web — Ticketseite (Stufen, Inhalt, Log, eine Aktion je Zustand)

**Files:**
- Create: `apps/web/lib/logFormat.ts`, `apps/web/lib/logFormat.test.ts`, `apps/web/components/StagePanel.tsx`, `StagePanel.test.tsx`, `TicketActions.tsx`, `TicketActions.test.tsx`, `LogList.tsx`
- Replace: `apps/web/components/TicketDetail.tsx`
- Move: `apps/web/app/tickets/[id]/` → `apps/web/app/tickets/[key]/` (`page.tsx` ersetzt, `not-found.tsx` unverändert)
- Modify: `apps/web/components/QuestionPanel.tsx`, `QuestionPanel.test.tsx`
- Delete: `apps/web/components/TicketLive.tsx`, `TicketLive.test.tsx`, `TicketMetaRow.tsx`, `PlanSection.tsx`

- [ ] **Step 1: Tests schreiben**

`apps/web/lib/logFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { AuditEventDto } from '@refinement/shared'
import { describeLogEvent, formatCost, formatTokens, runCostUsd } from './logFormat'

const at = new Date('2026-10-28T10:00:00Z')
const event = (type: string, payload: unknown, actor: AuditEventDto['actor'] = 'system'): AuditEventDto => ({ actor, type, payload, createdAt: at })

describe('describeLogEvent', () => {
  it.each([
    [event('ticket_imported', { sourcePath: 'examples/tickets/cb-2-lesezeit.md' }), 'Ticket übernommen aus examples/tickets/cb-2-lesezeit.md'],
    [event('run_started', { stage: 'plan', trigger: 'initial', model: 'claude-sonnet-4-6' }), 'Agent gestartet (1 Plan, Sonnet 4.6)'],
    [event('run_started', { stage: 'plan', trigger: 'answer', model: 'x' }), 'Agent gestartet (1 Plan, x, mit Antwort)'],
    [event('run_finished', { status: 'failed' }), 'Agent-Lauf abgebrochen'],
    [event('run_finished', { status: 'timeout' }), 'Agent-Zeitlimit überschritten'],
    [event('question_asked', { question: 'Wer?' }, 'agent'), 'Rückfrage: Wer?'],
    [event('answer_given', { answer: 'Alle' }, 'human'), 'Antwort: Alle'],
    [event('pr_opened', { prNumber: 4, branch: 'CB-2/intent' }), 'PR #4 geöffnet (CB-2/intent)'],
    [event('pr_merged', { prNumber: 4 }, 'human'), 'PR #4 gemergt'],
    [event('pr_closed', { prNumber: 4 }, 'human'), 'PR #4 ohne Merge geschlossen'],
    [event('stage_changed', { from: 'plan', to: 'design' }), 'Stufe 1 Plan → 2 Design'],
    [event('cleanup', { prNumber: 4, branch: 'CB-2/intent' }), 'Beim Start aufgeräumt: PR #4 geschlossen, Branch CB-2/intent gelöscht'],
    [event('error', { message: 'Rechte fehlen' }), 'Fehler: Rechte fehlen'],
    [event('something_new', null), 'something_new'],
  ])('describes %#', (input, text) => {
    expect(describeLogEvent(input)).toBe(text)
  })

  it('summarises a finished run with duration, tokens and cost', () => {
    expect(describeLogEvent(event('run_finished', {
      status: 'succeeded', model: 'claude-sonnet-4-6', durationSeconds: 75, costUsd: 0.0421,
      inputTokens: 1200, cacheCreationTokens: 300, cacheReadTokens: 0, outputTokens: 640,
    }, 'agent'))).toBe('Agent fertig in 1m 15s · 1.5K↑ 640↓ · $0.04')
  })
})

describe('cost and tokens', () => {
  it('formats token counts', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5K')
    expect(formatTokens(2000)).toBe('2K')
  })

  it('uses the reported cost and estimates it otherwise', () => {
    expect(runCostUsd({ costUsd: 0.5 })).toBe(0.5)
    expect(runCostUsd({ costUsd: 0, model: 'claude-sonnet-4-6', inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3)
    expect(runCostUsd({ costUsd: 0, model: 'unknown' })).toBe(0)
  })

  it('formats costs', () => {
    expect(formatCost(0)).toBe('—')
    expect(formatCost(0.0005)).toBe('$0.000500')
    expect(formatCost(0.005)).toBe('$0.0050')
    expect(formatCost(1.234)).toBe('$1.23')
  })
})
```

`apps/web/components/StagePanel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { StageViewDto } from '@refinement/shared'
import { StagePanel, stripFrontMatter } from './StagePanel'

const DONE: StageViewDto = {
  stage: 'plan',
  path: 'docs/work/CB-2/intent.md',
  fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-2/intent.md',
  completed: true,
  pr: { number: 1, url: 'https://github.com/o/r/pull/1', state: 'merged' },
  mergedAt: new Date('2026-10-28T12:00:00Z'),
  content: '---\nticket: CB-2\nstage: plan\n---\n\n# CB-2: Lesezeit anzeigen\n\n## Problem\n\nLeser wissen es nicht.\n',
}

const OPEN: StageViewDto = {
  stage: 'design', path: 'docs/work/CB-2/spec.md', fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-2/spec.md',
  completed: false, pr: null, mergedAt: null, content: null,
}

describe('StagePanel', () => {
  it('links file and PR of a completed stage', () => {
    render(<StagePanel view={DONE} />)
    expect(screen.getByLabelText('abgeschlossen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs/work/CB-2/intent.md' })).toHaveAttribute('href', DONE.fileUrl)
    expect(screen.getByRole('link', { name: 'PR #1 (gemergt)' })).toHaveAttribute('href', 'https://github.com/o/r/pull/1')
  })

  it('shows the content without front matter on demand', () => {
    render(<StagePanel view={DONE} />)
    expect(screen.queryByRole('heading', { name: 'CB-2: Lesezeit anzeigen' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Inhalt anzeigen' }))
    expect(screen.getByRole('heading', { name: 'CB-2: Lesezeit anzeigen' })).toBeInTheDocument()
    expect(screen.queryByText(/ticket: CB-2/)).toBeNull()
  })

  it('shows an open stage without links and content', () => {
    render(<StagePanel view={OPEN} />)
    expect(screen.getByLabelText('offen')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('stripFrontMatter', () => {
  it('removes the YAML header only', () => {
    expect(stripFrontMatter('---\na: b\n---\n\n# T\n')).toBe('# T\n')
    expect(stripFrontMatter('# T\n---\n')).toBe('# T\n---\n')
  })
})
```

`apps/web/components/TicketActions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { TicketDetailDto, TicketEvent } from '@refinement/shared'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

vi.mock('@/app/actions', () => ({
  startStageAction: vi.fn(),
  stopRunAction: vi.fn(),
  answerQuestionAction: vi.fn(),
}))

const sse = vi.hoisted(() => ({
  handlers: null as null | { onMessage: (e: TicketEvent) => void; onReconnect?: () => void },
}))
vi.mock('@/hooks/useSSE', () => ({
  useSSE: (_key: string | null, handlers: { onMessage: (e: TicketEvent) => void; onReconnect?: () => void }) => {
    sse.handlers = handlers
    return { connected: true, everConnected: true }
  },
}))

import { startStageAction, stopRunAction } from '@/app/actions'
import { DEFAULT_MODEL } from '@/lib/constants'
import { AppStateProvider } from './AppStateProvider'
import { TicketActions } from './TicketActions'

const NOW = new Date('2026-10-28T10:00:00Z')

const DETAIL: TicketDetailDto = {
  key: 'CB-2', title: 'Lesezeit', description: 'D', priority: 'Mittel', sourcePath: 'examples/tickets/cb-2-lesezeit.md',
  stage: 'plan', state: 'ready', openPr: null, updatedAt: NOW, stages: [], log: [], pendingQuestion: null,
}

function renderActions(patch: Partial<TicketDetailDto> = {}, tokenConfigured = true) {
  return render(
    <AppStateProvider>
      <TicketActions ticket={{ ...DETAIL, ...patch }} tokenConfigured={tokenConfigured} />
    </AppStateProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TicketActions', () => {
  it('starts the plan stage with the default model', async () => {
    vi.mocked(startStageAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Plan starten' }))
    await waitFor(() => expect(startStageAction).toHaveBeenCalledWith('CB-2', { model: DEFAULT_MODEL }))
  })

  it('disables the start without token and says why', () => {
    renderActions({}, false)
    expect(screen.getByRole('button', { name: 'Plan starten' })).toBeDisabled()
    expect(screen.getByText(/GITHUB_TOKEN fehlt/)).toBeInTheDocument()
  })

  it('shows the error of a rejected action', async () => {
    vi.mocked(startStageAction).mockResolvedValue({ ok: false, error: 'Stufe kann im Zustand plan/running nicht gestartet werden' })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Plan starten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht gestartet werden')
  })

  it('offers a restart after a failure', () => {
    renderActions({ state: 'failed' })
    expect(screen.getByText(/fehlgeschlagen — Details im Log/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan starten' })).toBeEnabled()
  })

  it('shows the progress of a running agent and stops it', async () => {
    vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions({ state: 'running' })
    act(() => sse.handlers?.onMessage({ type: 'progress', ticketKey: 'CB-2', message: 'Codebase wird analysiert...' }))
    expect(screen.getByText('Codebase wird analysiert...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan starten' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stoppen' }))
    await waitFor(() => expect(stopRunAction).toHaveBeenCalledWith('CB-2'))
  })

  it('shows the question while waiting for an answer', () => {
    renderActions({ state: 'awaiting_answer', pendingQuestion: 'Gilt das auch für Entwürfe?' })
    expect(screen.getByText('Gilt das auch für Entwürfe?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antworten' })).toBeInTheDocument()
  })

  it('links the open PR while in review', () => {
    renderActions({ state: 'in_review', openPr: { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open' } })
    expect(screen.getByRole('link', { name: 'PR #3 öffnen' })).toHaveAttribute('href', 'https://github.com/o/r/pull/3')
    expect(screen.getByText(/Merge auf GitHub = Freigabe/)).toBeInTheDocument()
  })

  it('keeps the design stage disabled until stage 2 exists', () => {
    renderActions({ stage: 'design' })
    expect(screen.getByRole('button', { name: 'Design starten' })).toBeDisabled()
  })

  it('reports a finished ticket', () => {
    renderActions({ stage: 'done' })
    expect(screen.getByText('Alle Stufen abgeschlossen.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('refreshes the page on state and question events and after a reconnect', () => {
    renderActions({ state: 'running' })
    act(() => sse.handlers?.onMessage({ type: 'state', ticketKey: 'CB-2', stage: 'plan', state: 'in_review' }))
    act(() => sse.handlers?.onReconnect?.())
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})
```

In `apps/web/components/QuestionPanel.test.tsx` die Prop umbenennen und Schlüssel anpassen:

```bash
cd apps/web
sed -i '' 's/ticketId="T-1"/ticketKey="CB-1"/g; s/toHaveBeenCalledWith(.T-1., /toHaveBeenCalledWith('"'"'CB-1'"'"', /' components/QuestionPanel.test.tsx
grep -n "T-1\|ticketId" components/QuestionPanel.test.tsx
```

Expected: `grep` gibt nichts aus.

- [ ] **Step 2: Tests fehlschlagen sehen**

Run: `cd apps/web && npx vitest run lib/logFormat.test.ts components/StagePanel.test.tsx components/TicketActions.test.tsx components/QuestionPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

`apps/web/lib/logFormat.ts`:

```ts
import type { AuditEventDto, Stage } from '@refinement/shared'
import { CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, MODELS, MODEL_PRICING, MTOK, STAGE_LABEL } from './constants'
import { formatElapsed } from './utils'

const TOKENS_PER_K = 1000

type Payload = Record<string, unknown>

const text = (p: Payload, key: string) => (p[key] === undefined || p[key] === null ? '' : String(p[key]))
const count = (p: Payload, key: string) => (typeof p[key] === 'number' ? (p[key] as number) : 0)
const modelLabel = (model: string) => MODELS.find((m) => m.value === model)?.label ?? model
const stageLabel = (stage: string) => STAGE_LABEL[stage as Stage] ?? stage

/** 1500 → "1.5K" */
export function formatTokens(n: number): string {
  if (n < TOKENS_PER_K) return String(n)
  const k = n / TOKENS_PER_K
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`
}

/** Cost of a run: the reported value, otherwise estimated from the pricing table; 0 if unknown. */
export function runCostUsd(p: Payload): number {
  const reported = count(p, 'costUsd')
  if (reported > 0) return reported
  const pricing = MODEL_PRICING[text(p, 'model')]
  if (!pricing) return 0
  return (count(p, 'inputTokens') / MTOK) * pricing.inputPerMtok
    + (count(p, 'cacheCreationTokens') / MTOK) * pricing.inputPerMtok * CACHE_WRITE_MULTIPLIER
    + (count(p, 'cacheReadTokens') / MTOK) * pricing.inputPerMtok * CACHE_READ_MULTIPLIER
    + (count(p, 'outputTokens') / MTOK) * pricing.outputPerMtok
}

export function formatCost(usd: number): string {
  if (usd === 0) return '—'
  return `$${usd < 0.001 ? usd.toFixed(6) : usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
}

/** One German line per log entry; unknown types fall back to the type name. */
export function describeLogEvent(event: AuditEventDto): string {
  const p = (event.payload ?? {}) as Payload
  switch (event.type) {
    case 'ticket_imported':
      return `Ticket übernommen aus ${text(p, 'sourcePath')}`
    case 'run_started':
      return `Agent gestartet (${stageLabel(text(p, 'stage'))}, ${modelLabel(text(p, 'model'))}${p.trigger === 'answer' ? ', mit Antwort' : ''})`
    case 'run_finished': {
      if (p.status === 'timeout') return 'Agent-Zeitlimit überschritten'
      if (p.status !== 'succeeded') return 'Agent-Lauf abgebrochen'
      const tokensIn = count(p, 'inputTokens') + count(p, 'cacheCreationTokens')
      return `Agent fertig in ${formatElapsed(count(p, 'durationSeconds'))} · ${formatTokens(tokensIn)}↑ ${formatTokens(count(p, 'outputTokens'))}↓ · ${formatCost(runCostUsd(p))}`
    }
    case 'question_asked':
      return `Rückfrage: ${text(p, 'question')}`
    case 'answer_given':
      return `Antwort: ${text(p, 'answer')}`
    case 'pr_opened':
      return `PR #${count(p, 'prNumber')} geöffnet (${text(p, 'branch')})`
    case 'pr_merged':
      return `PR #${count(p, 'prNumber')} gemergt`
    case 'pr_closed':
      return `PR #${count(p, 'prNumber')} ohne Merge geschlossen`
    case 'stage_changed':
      return `Stufe ${stageLabel(text(p, 'from'))} → ${stageLabel(text(p, 'to'))}`
    case 'cleanup':
      return `Beim Start aufgeräumt: PR #${count(p, 'prNumber')} geschlossen, Branch ${text(p, 'branch')} gelöscht`
    case 'error':
      return `Fehler: ${text(p, 'message')}`
    default:
      return event.type
  }
}
```

`apps/web/components/LogList.tsx`:

```tsx
import type { AuditEventDto } from '@refinement/shared'
import { describeLogEvent } from '@/lib/logFormat'

const ACTOR_LABEL: Record<AuditEventDto['actor'], string> = { human: 'Mensch', agent: 'Agent', system: 'System' }
const TIME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' })

/** Persistent log of the ticket, oldest first. */
export function LogList({ log }: { log: AuditEventDto[] }) {
  if (log.length === 0) return <p className="text-xs text-slate-400">Noch keine Einträge.</p>
  return (
    <ol className="space-y-1">
      {log.map((event, index) => (
        <li key={index} className="flex gap-3 text-xs">
          <time className="shrink-0 font-mono text-slate-400" dateTime={event.createdAt.toISOString()}>
            {TIME.format(event.createdAt)}
          </time>
          <span className="w-12 shrink-0 text-slate-500">{ACTOR_LABEL[event.actor]}</span>
          <span className="text-slate-700">{describeLogEvent(event)}</span>
        </li>
      ))}
    </ol>
  )
}
```

`apps/web/components/StagePanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { PrState, StageViewDto } from '@refinement/shared'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const TITLE: Record<StageViewDto['stage'], string> = { plan: '1 Plan · Intent', design: '2 Design · Spec' }
const PR_STATE: Record<PrState, string> = { open: 'offen', merged: 'gemergt', closed: 'geschlossen' }
const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

/** The YAML header is metadata for tools; Markdown would render it as text. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, '')
}

/** One artifact stage: done mark, links to file and PR, content (live from the default branch) on demand. */
export function StagePanel({ view }: { view: StageViewDto }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span aria-label={view.completed ? 'abgeschlossen' : 'offen'} className={view.completed ? 'text-emerald-600' : 'text-slate-300'}>
            {view.completed ? '✓' : '○'}
          </span>
          {TITLE[view.stage]}
          {view.mergedAt && <span className="text-xs font-normal text-slate-400">gemergt am {DATE.format(view.mergedAt)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-3">
          {view.completed ? (
            <a href={view.fileUrl} target="_blank" rel="noreferrer" className="font-mono underline">{view.path}</a>
          ) : (
            <span className="font-mono text-slate-400">{view.path}</span>
          )}
          {view.pr && (
            <a href={view.pr.url} target="_blank" rel="noreferrer" className="underline">
              PR #{view.pr.number} ({PR_STATE[view.pr.state]})
            </a>
          )}
        </div>
        {view.content !== null && (
          <>
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="btn-ghost-xs">
              {open ? 'Inhalt einklappen' : 'Inhalt anzeigen'}
            </button>
            {open && (
              <div className="prose-plan">
                <ReactMarkdown>{stripFrontMatter(view.content)}</ReactMarkdown>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

`apps/web/components/TicketActions.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TicketDetailDto } from '@refinement/shared'
import { startStageAction, stopRunAction } from '@/app/actions'
import type { ActionResult } from '@/lib/actionResult'
import { DEFAULT_MODEL } from '@/lib/constants'
import { useSSE } from '@/hooks/useSSE'
import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
import { useAppState } from './AppStateProvider'
import { AgentRunningCard } from './AgentRunningCard'
import { ModelSelect } from './ModelSelect'
import { QuestionPanel } from './QuestionPanel'
import { Button, buttonVariants } from './ui/button'

interface Props {
  ticket: TicketDetailDto
  tokenConfigured: boolean
}

/**
 * Exactly one action per state: start, stop, answer or open the PR.
 * Progress events feed the live log; state and question events refresh the server-rendered page,
 * which delivers the new state as props.
 */
export function TicketActions({ ticket, tokenConfigured }: Props) {
  const router = useRouter()
  const { progressLogs, appendProgress } = useAppState()
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const { connected, everConnected } = useSSE(ticket.key, {
    onMessage: (event) => {
      if (event.type === 'progress') appendProgress(ticket.key, event.message)
      else router.refresh()
    },
    onReconnect: () => router.refresh(),
  })

  const running = ticket.state === 'running'
  const startable = ticket.state === 'ready' || ticket.state === 'failed'
  const elapsed = useElapsedSeconds(running, !running)

  const run = (action: () => Promise<ActionResult<unknown>>) =>
    startTransition(async () => {
      setError(null)
      const result = await action()
      if (!result.ok) setError(result.error)
    })

  return (
    <section className="space-y-3">
      {ticket.stage === 'done' && <p className="text-sm text-emerald-700">Alle Stufen abgeschlossen.</p>}

      {ticket.stage === 'plan' && startable && (
        <div className="space-y-2">
          {ticket.state === 'failed' && <p className="text-sm text-red-600">Letzter Versuch fehlgeschlagen — Details im Log.</p>}
          <div className="flex items-center gap-2">
            <ModelSelect value={model} onChange={setModel} disabled={pending} size="sm" />
            <Button disabled={!tokenConfigured || pending} onClick={() => run(() => startStageAction(ticket.key, { model }))}>
              Plan starten
            </Button>
          </div>
          {!tokenConfigured && (
            <p className="text-xs text-amber-700">
              GITHUB_TOKEN fehlt — ohne Token kann die App keinen Branch und PR anlegen (siehe README).
            </p>
          )}
        </div>
      )}

      {ticket.stage === 'design' && startable && (
        <div className="space-y-1">
          <Button disabled>Design starten</Button>
          <p className="text-xs text-slate-500">Der Design-Agent (Stufe 2) folgt im nächsten Schritt.</p>
        </div>
      )}

      {running && (
        <>
          <AgentRunningCard
            elapsed={elapsed}
            progressLog={progressLogs[ticket.key] ?? []}
            connected={connected}
            everConnected={everConnected}
          />
          <Button variant="outline" disabled={pending} onClick={() => run(() => stopRunAction(ticket.key))}>
            Stoppen
          </Button>
        </>
      )}

      {ticket.state === 'awaiting_answer' && ticket.pendingQuestion && (
        <QuestionPanel ticketKey={ticket.key} question={ticket.pendingQuestion} onAnswered={() => router.refresh()} />
      )}

      {ticket.state === 'in_review' && ticket.openPr && (
        <div className="space-y-1">
          <a href={ticket.openPr.url} target="_blank" rel="noreferrer" className={buttonVariants()}>
            PR #{ticket.openPr.number} öffnen
          </a>
          <p className="text-xs text-slate-500">
            Merge auf GitHub = Freigabe dieser Stufe. Die App prüft den PR jede Minute und beim Öffnen dieser Seite.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}
```

`apps/web/components/QuestionPanel.tsx`: Prop `ticketId` → `ticketKey` (Interface, Destrukturierung, Aufruf):

```tsx
interface Props {
  ticketKey: string
  /** Question asked by the agent. */
  question: string
  /** Called after the answer was accepted. */
  onAnswered: () => void
}

/** Amber card shown while the agent waits for a human answer. */
export function QuestionPanel({ ticketKey, question, onAnswered }: Props) {
```

und in `handleSubmit`: `const result = await answerQuestionAction(ticketKey, { answer })`.

`apps/web/components/TicketDetail.tsx` (ersetzt die Datei):

```tsx
import ReactMarkdown from 'react-markdown'
import type { TicketDetailDto } from '@refinement/shared'
import { STAGE_LABEL, STATE_VARIANT, stateText } from '@/lib/constants'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { LogList } from './LogList'
import { StagePanel } from './StagePanel'
import { TicketActions } from './TicketActions'

/** Server-rendered ticket page: header, the one action, source ticket, stages, log. */
export function TicketDetail({ ticket, tokenConfigured }: { ticket: TicketDetailDto; tokenConfigured: boolean }) {
  return (
    <div className="max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{ticket.key}</span>
          {ticket.priority && <span>· Priorität {ticket.priority}</span>}
        </div>
        <h2 className="text-xl font-semibold">{ticket.title}</h2>
        <div className="flex gap-2">
          <Badge variant="outline">{STAGE_LABEL[ticket.stage]}</Badge>
          {ticket.stage !== 'done' && <Badge variant={STATE_VARIANT[ticket.state]}>{stateText(ticket)}</Badge>}
        </div>
      </header>

      {/* key: navigating to another ticket resets model, error and live log state */}
      <TicketActions key={ticket.key} ticket={ticket} tokenConfigured={tokenConfigured} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-600">Ticket</h3>
        <p className="font-mono text-xs text-slate-400">Quelle: {ticket.sourcePath}</p>
        <div className="prose-plan">
          <ReactMarkdown>{ticket.description}</ReactMarkdown>
        </div>
      </section>

      <Separator />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600">Stufen</h3>
        {ticket.stages.map((view) => (
          <StagePanel key={view.stage} view={view} />
        ))}
      </section>

      <Separator />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-600">Log</h3>
        <LogList log={ticket.log} />
      </section>
    </div>
  )
}
```

Route verschieben und Seite ersetzen:

```bash
cd apps/web
git mv 'app/tickets/[id]' 'app/tickets/[key]'
git rm components/TicketLive.tsx components/TicketLive.test.tsx components/TicketMetaRow.tsx components/PlanSection.tsx
```

`apps/web/app/tickets/[key]/page.tsx` (ersetzt die Datei):

```tsx
import { notFound } from 'next/navigation'
import { errorCode } from '@refinement/core'
import type { TicketDetailDto } from '@refinement/shared'
import { getEngine } from '@/lib/container'
import { TicketDetail } from '@/components/TicketDetail'

/** Checks the ticket's PR first, so a merge shows up as soon as the page is opened. */
async function loadTicket(key: string): Promise<TicketDetailDto> {
  const engine = getEngine()
  try {
    await engine.syncReviews(key)
    return await engine.getTicket(key)
  } catch (err) {
    if (errorCode(err) === 'NOT_FOUND') notFound()
    throw err
  }
}

export default async function TicketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const ticket = await loadTicket(key)
  return <TicketDetail ticket={ticket} tokenConfigured={getEngine().getSettings().tokenConfigured} />
}
```

- [ ] **Step 4: Web komplett grün**

```bash
cd apps/web
npx vitest run lib/logFormat.test.ts components/StagePanel.test.tsx components/TicketActions.test.tsx components/QuestionPanel.test.tsx
npm test
npx tsc --noEmit
rg -n "ticketId|RefinementEvent|TicketStatus|STATUS_LABEL|repoUrl\b.*localStorage|startRefinement|deleteTicket|createTicket" app components hooks lib
```

Expected: alle Tests PASS, keine Typfehler, `rg` ohne Treffer.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): Ticketseite mit Stufen, Inhalt vom Default-Branch, Log und einer Aktion je Zustand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 23: Doku — README und Ticket-Eingang

**Files:**
- Replace: `README.md`, `examples/tickets/README.md`

Pflichtinhalte (vom Nutzer gefordert): wie man das Token bekommt; Annahme „Ziel-Repo ist öffentlich“; beim Start werden offene PRs der App geschlossen und ihre Branches gelöscht; eine neue Datei `cb-4-….md` erscheint nach Neustart oder Reset als Ticket.

- [ ] **Step 1: `README.md` schreiben** (ersetzt die Datei):

````markdown
# Refinement Engine

Führt Tickets durch die ersten beiden Stufen des [AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook):
**Plan** (Ticket → `intent.md`) und **Design** (Intent → `spec.md`). Ein Agent schreibt das Artefakt, die App legt
es auf einem eigenen Branch im Ziel-Repo ab und öffnet einen Pull Request. **Der Merge ist die Freigabe** und
schiebt das Ticket in die nächste Stufe. Die App hält nur Stufe, Zustand, Verweise und ein Log pro Ticket;
die Inhalte liegen in Git.

Stand: Stufe 1 (Plan) läuft Ende zu Ende. Stufe 2 (Design) folgt.

## Starten

```bash
npm install
npm run dev
```

Startet die Next.js-App unter http://localhost:3000. Ohne Token läuft die App, kann aber keine Stufe starten
(Hinweis in der Seitenleiste).

## Annahmen

- **Das Ziel-Repo ist öffentlich.** Lesen und Klonen gehen ohne Token. Private Repos sind noch nicht vorgesehen.
- **Schreiben braucht trotzdem ein Token** (GitHub-Vorgabe): Branch anlegen, Datei committen, PR öffnen.
- Ablage im Ziel-Repo: `docs/work/<TICKET>/intent.md` (später `spec.md`) auf dem Branch `<TICKET>/intent`
  (später `<TICKET>/spec`), PR gegen den Default-Branch (beim Beispiel-Repo `master`).

## Einrichten

### 1. Ziel-Repo

Vorgabe ist [wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app),
ein Fork des RealWorld-Backends „Conduit“. In dieses Repo kann nur dessen Besitzer schreiben — wer die App
selbst ausprobiert, forkt es (oder nimmt ein eigenes öffentliches Repo) und trägt den Fork als `TARGET_REPO` ein.

### 2. GitHub-Token anlegen (Fine-grained Personal Access Token)

1. GitHub öffnen → Profilbild → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**
   (direkt: https://github.com/settings/personal-access-tokens/new).
2. **Token name:** z. B. `refinement-engine`; **Expiration:** kurz wählen (z. B. 30 Tage).
3. **Resource owner:** das Konto, dem das Ziel-Repo gehört.
4. **Repository access:** **Only select repositories** → nur das Ziel-Repo auswählen.
5. **Permissions → Repository permissions:**
   - **Contents:** Read and write (Branch anlegen, Datei committen, Branch löschen)
   - **Pull requests:** Read and write (PR öffnen, Status lesen, PR schließen)
   - **Metadata:** Read-only (setzt GitHub automatisch)
6. **Generate token** und den Wert (`github_pat_…`) kopieren — GitHub zeigt ihn nur einmal.

### 3. `apps/web/.env.local`

```bash
GITHUB_TOKEN=github_pat_...
TARGET_REPO=https://github.com/<dein-konto>/node-express-realworld-example-app
```

Die Datei ist in Git ignoriert. Nach einer Änderung die App neu starten.

## Verhalten beim Start

Bei jedem Start (und beim **Reset**-Button, der vorher die Datenbank leert):

1. **Tickets einlesen:** jede Datei `examples/tickets/*.md` wird ein Ticket (siehe
   [`examples/tickets/README.md`](examples/tickets/README.md)). Geänderter Text wird übernommen, Stufe und Zustand bleiben.
2. **Merges nachziehen:** PRs, die gemergt wurden, während die App aus war, schieben ihr Ticket weiter.
3. **Aufräumen:** **alle offenen PRs der App werden geschlossen und ihre Branches gelöscht** — erkannt am
   Branch-Namen `<TICKET>/intent` bzw. `<TICKET>/spec` eines bekannten Tickets. PRs anderer Branches bleiben
   unberührt. GitHub kann PRs nicht löschen; geschlossene PRs bleiben in der Historie des Repos.
4. **Stufe ableiten:** liegt `docs/work/<TICKET>/spec.md` auf dem Default-Branch → Fertig; liegt dort
   `intent.md` → Stufe 2 Design; sonst Stufe 1 Plan. Gemergte Artefakte bleiben also erhalten.

Ohne Token oder wenn GitHub nicht erreichbar ist, startet die App mit dem Stand der Datenbank und schreibt eine
Warnung ins Server-Log.

## Ablauf (Stufe 1)

1. Ticket auf dem Board öffnen (CB-2 ist der kleinste Lauf), Modell wählen, **Plan starten**.
2. Der Agent liest das Ticket und den Klon des Ziel-Repos. Bei einer blockierenden Unklarheit stellt er eine
   **Rückfrage** in der App; die Antwort fließt in den nächsten Lauf und landet unter „Geklärte Rückfragen“.
3. Die App legt `docs/work/<TICKET>/intent.md` auf dem Branch `<TICKET>/intent` an und öffnet den PR
   `<TICKET>: Intent`.
4. Auf GitHub prüfen und **mergen** — innerhalb von 60 Sekunden (sofort beim Öffnen der Ticketseite) steht das
   Ticket in Stufe 2 Design, der Inhalt des Intent ist in der App sichtbar. **Schließen ohne Merge** setzt das
   Ticket auf „bereit“ zurück und löscht den Branch.

Ein Lauf nutzt den eigenen Claude-Login und verbraucht Tokens; Kosten und Tokens stehen im Log des Tickets.

## Neues Ticket

Eine Datei `examples/tickets/cb-4-<kurzname>.md` anlegen (Format in
[`examples/tickets/README.md`](examples/tickets/README.md)). **Sie erscheint nach einem Neustart oder Reset als
neues Ticket.**

## Struktur

```
apps/
  web/            # Next.js (App Router): Board, Ticketseite, Server Actions, SSE-Route – der einzige Prozess
packages/
  core/           # Fachkern nach Ports & Adapters (Domäne, Use Cases; Adapter für SQLite, GitHub,
                  # Markdown-Tickets, Git-Klon, Claude CLI, Events)
  shared/         # Zod-Verträge zwischen Kern und UI (DTOs, Inputs, Events, Agent-Ausgabe)
examples/tickets/ # simulierte Jira-Tickets (Ticket-Eingang)
```

Abhängigkeitsrichtung: `web → core → shared`. Domäne und Use Cases importieren keine Adapter; das prüft `npm run lint`.

## Voraussetzungen

- Node.js 20+
- `claude` CLI eingeloggt (`claude login`); das Binary kommt über `@anthropic-ai/claude-code` als Abhängigkeit von `packages/core`
- `git` (die App klont das Ziel-Repo für den Agent)

## Umgebungsvariablen (`apps/web/.env.local`)

| Variable                | Vorgabe                                                              | Zweck                                       |
|-------------------------|----------------------------------------------------------------------|---------------------------------------------|
| `GITHUB_TOKEN`          | —                                                                    | Schreiben ins Ziel-Repo (siehe oben)        |
| `TARGET_REPO`           | `https://github.com/wojciechlaka/node-express-realworld-example-app` | Ziel-Repo auf GitHub                        |
| `REPO_CACHE_DIR`        | `$TMPDIR/repo-cache`                                                 | Ablage des Klons                            |
| `DB_PATH`               | `apps/web/data/refinement.db`                                        | SQLite-Datei                                |
| `REFINEMENT_TIMEOUT_MS` | `600000` (10 min)                                                    | maximale Laufzeit eines Agent-Laufs         |

## Befehle

| Befehl          | Zweck                                      |
|-----------------|--------------------------------------------|
| `npm run dev`   | Entwicklungsserver (http://localhost:3000) |
| `npm run build` | Typprüfung aller Pakete + `next build`     |
| `npm start`     | gebaute App starten                        |
| `npm test`      | alle Tests (Vitest)                        |
| `npm run lint`  | Abhängigkeitsregel des Hexagons            |

Die App läuft als ein dauerhafter Node-Prozess (lang laufende Agent-Prozesse, Event-Bus im Speicher, lokale
SQLite, Abgleich-Timer). Serverless-Hosting wird nicht unterstützt (siehe [E2](docs/decisions.md)).
````

- [ ] **Step 2: `examples/tickets/README.md` schreiben** (ersetzt die Datei):

````markdown
# Ticket-Eingang: Beispiel-Tickets für „Conduit“

Jede Markdown-Datei in diesem Ordner simuliert ein Jira-Ticket und ist die **einzige Quelle** für die Tickets
der App. Die Tickets sind bewusst roh und unterspezifiziert — so, wie ein Stakeholder sie ins Backlog wirft.
Der Intent-Agent macht daraus in Stufe 1 ein `intent.md` im Ziel-Repo
[wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)
(Fork von [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app)).

Kontext zum Repo: Backend des Blogs „Conduit“ (Medium-Klon aus dem RealWorld-Projekt) — TypeScript, Express,
Prisma; REST-API für Artikel, Kommentare, Tags, Favoriten, Follow und Auth.

| Ticket | Zweck in der Demo |
|---|---|
| CB-1 Entwürfe | mittel, mehrere Schichten (Modell, API, Feed, Rechte) — echte Rückfragen |
| CB-2 Lesezeit | klein — schneller, günstiger Lauf |
| CB-3 Kommentare melden | fachlich unklar (wer moderiert? was passiert danach?) — Agent muss Regeln erfragen |

## Neues Ticket anlegen

1. Datei `cb-<nummer>-<kurzname>.md` in diesem Ordner anlegen, z. B. `cb-4-tags-umbenennen.md`.
2. Format:

   ```markdown
   # CB-4: Tags umbenennen

   Freier Text: Was soll sich ändern, für wen, warum? Gern roh und unvollständig.

   **Priorität:** Niedrig
   ```

   - **Erste Zeile** ist Pflicht: `# <SCHLÜSSEL>: <Titel>`. Der Schlüssel besteht aus Großbuchstaben, Bindestrich
     und Nummer (`CB-4`) und muss eindeutig sein. Er bestimmt Branch (`CB-4/intent`) und Ablage
     (`docs/work/CB-4/intent.md`).
   - Der Text darunter wird die Beschreibung.
   - Die Zeile `**Priorität:** …` ist optional.
3. App neu starten oder **Reset** klicken — **das neue Ticket erscheint in Stufe 1 Plan.**

Dateien ohne passende erste Zeile werden mit einer Warnung im Server-Log übersprungen (diese README still).
Geänderter Text eines bestehenden Tickets wird beim nächsten Start übernommen; Stufe und Zustand bleiben.
Löscht man eine Datei, bleibt das Ticket bis zum nächsten Reset in der App.
````

- [ ] **Step 3: Prüfen**

```bash
grep -n "öffentlich\|Fine-grained\|geschlossen und ihre Branches gelöscht\|Neustart oder Reset" README.md
grep -n "Neustart\|Reset" examples/tickets/README.md
grep -rn "seeds.ts\|Seed-Tickets" README.md examples/tickets/README.md
```

Expected: die ersten beiden Befehle finden je mindestens eine Zeile pro Begriff, der dritte nichts.

- [ ] **Step 4: Commit**

```bash
git add README.md examples/tickets/README.md
git commit -m "docs: README für Stufe 1 — Token, TARGET_REPO, Start-Verhalten, neues Ticket

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 24: Abschlussprüfung

**Files:** keine Änderungen erwartet; gefundene Fehler im jeweiligen Paket beheben und mit `fix: …` committen.

- [ ] **Step 1: Alles grün**

```bash
npm test
npm run build
npm run lint
```

Expected: alle Workspaces PASS, `next build` erfolgreich, Lint ohne Fehler.

- [ ] **Step 2: Start ohne Token (keine GitHub-Schreibzugriffe)**

```bash
rm -f apps/web/data/refinement.db
env -u GITHUB_TOKEN npm run dev > /tmp/refinement-dev.log 2>&1 &
sleep 15
curl -s http://localhost:3000/ | grep -o 'CB-[0-9]*' | sort -u
grep -n "GITHUB_TOKEN fehlt\|Ticket(s) gelesen" /tmp/refinement-dev.log
```

Expected: genau `CB-1`, `CB-2`, `CB-3`; im Log `[startup] 3 Ticket(s) gelesen, 3 neu` und die Warnung zum fehlenden Token.
Falls `apps/web/.env.local` ein Token enthält, die Datei für diesen Schritt kurz umbenennen (`.env.local.off`) und danach zurückbenennen — **ohne Zustimmung des Nutzers keine PRs im Fork anlegen oder schließen.**

- [ ] **Step 3: Neues Ticket per Datei**

```bash
printf '# CB-4: Testticket\n\nNur für die Abnahme.\n' > examples/tickets/cb-4-test.md
kill %1; sleep 2
env -u GITHUB_TOKEN npm run dev >> /tmp/refinement-dev.log 2>&1 &
sleep 15
curl -s http://localhost:3000/ | grep -o 'CB-[0-9]*' | sort -u
curl -s http://localhost:3000/tickets/CB-4 | grep -o 'Testticket' | head -1
rm examples/tickets/cb-4-test.md
kill %1
```

Expected: `CB-1` … `CB-4`; die Ticketseite zeigt „Testticket“. Danach ist die Datei wieder gelöscht (`git status` sauber).

- [ ] **Step 4: Ticketseite im Browser ansehen**

`npm run dev` starten, http://localhost:3000 und http://localhost:3000/tickets/CB-2 öffnen: Board mit drei Spalten, Ticketseite mit Quelle, zwei Stufen, Log („Ticket übernommen aus …“), deaktiviertem „Plan starten“ samt Token-Hinweis. Unbekannter Schlüssel (`/tickets/CB-99`) zeigt „Ticket nicht gefunden.“

- [ ] **Step 5: Manueller Durchlauf gegen den Fork — nur nach Zustimmung des Nutzers**

Nicht selbstständig ausführen. Dem Nutzer vorschlagen (Token nötig, erzeugt Branch und PR im Fork, verbraucht Claude-Tokens):
CB-2 → „Plan starten“ → PR `CB-2/intent` mit `docs/work/CB-2/intent.md` → auf GitHub mergen → binnen 60 s Stufe Design, Intent-Inhalt in der App → Neustart schließt eventuell offene App-PRs, gemergter Intent bleibt.

- [ ] **Step 6: Abschluss**

`git status` ist sauber, `git log --oneline main..HEAD` zeigt die Commits der Tasks 1–23 (plus Fixes). Weiter mit `superpowers:finishing-a-development-branch`.
