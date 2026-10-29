# Next.js + Hexagonal – Teil 3: Aufräumen und Dokumentation – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vite-Frontend und Hono-Backend werden entfernt; `npm run dev` startet nur noch die Next.js-App auf Port 3000. README, CLAUDE.md und das Entscheidungslog (D19) beschreiben den neuen Stand.

**Architecture:** Nach diesem Teil besteht das Repo aus `apps/web` (Next.js, treibender Adapter), `packages/core` (Hexagon) und `packages/shared` (Zod-Verträge). Spec: `docs/superpowers/specs/2026-10-28-nextjs-hexagonal-design.md` (Abschnitte 9–10).

**Tech Stack:** npm workspaces, Next.js 16, Vitest 4.

**Voraussetzung:** Teil 2 ist abgeschlossen (funktionale Parität geprüft). Branch `feature/nextjs-hexagonal`. Befehle laufen im Repo-Root.

---

### Task 1: Alte Apps entfernen, Skripte vereinfachen

**Files:**
- Delete: `apps/frontend/`, `apps/backend/`
- Modify: `package.json` (Root), `apps/web/package.json`, `.gitignore` (Root)

- [ ] **Step 1: Laufende Dev-Server beenden**

Run: `lsof -iTCP:3000 -iTCP:3001 -iTCP:5173 -sTCP:LISTEN`
Expected: keine Prozesse dieses Repos (Vite, Hono, Next) mehr; ggf. die in Teil 1/2 gestarteten Server stoppen. Fremde Prozesse (z. B. ein Vite aus einem anderen Projektordner) nicht beenden, sondern dem Nutzer melden.

- [ ] **Step 2: Alte Apps löschen**

```bash
git rm -r -q apps/frontend apps/backend
rm -rf apps/frontend apps/backend
ls apps
```
Expected: nur `web`. (`rm -rf` entfernt ignorierte Reste wie `node_modules` oder die alte `data/refinement.db`.)

- [ ] **Step 3: Root-`package.json` ersetzen**

`package.json` (komplett ersetzen):

```json
{
  "name": "refinement-engine",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w apps/web",
    "start": "npm run start -w apps/web",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

`concurrently` und `wait-on` entfallen, weil es nur noch einen Prozess gibt.

- [ ] **Step 4: Next.js auf den Standard-Port 3000 setzen**

In `apps/web/package.json` im Objekt `scripts` die beiden Einträge ersetzen:

```json
    "dev": "next dev",
    "start": "next start",
```

- [ ] **Step 5: Root-`.gitignore` bereinigen**

In `.gitignore` den Block

```
# lokale SQLite-Datenbank (wird beim Start automatisch angelegt)
apps/backend/data/*.db
apps/backend/data/*.db-*
```
ersetzen durch
```
# lokale SQLite-Datenbank (wird beim Start automatisch angelegt)
apps/web/data/
packages/core/data/
```
(`packages/core/data/` deckt die Datei ab, die `drizzle-kit` laut `drizzle.config.ts` anlegt.)

- [ ] **Step 6: Abhängigkeiten neu auflösen, Tests und Build**

Run: `npm install && npm test && npm run build && npm run lint`
Expected: `npm install` ohne Fehler; Tests in `packages/shared`, `packages/core`, `apps/web` PASS; `next build` erfolgreich; Lint (nur `packages/core`) ohne Befund.

- [ ] **Step 7: Keine Verweise auf die alten Apps im Code**

Run: `grep -rn "apps/backend\|apps/frontend" --include=*.ts --include=*.tsx --include=*.json --include=*.mjs . | grep -v node_modules | grep -v package-lock.json`
Expected: keine Treffer.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: Vite-Frontend und Hono-Backend entfernt, Next.js ist der einzige Prozess

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: README, CLAUDE.md und Entscheidung D19

**Files:**
- Rewrite: `README.md`
- Rewrite: `CLAUDE.md`
- Modify: `docs/decisions.md` (D19 anhängen; D2 mit Verweis versehen)

- [ ] **Step 1: `README.md` ersetzen**

`README.md` (komplett ersetzen):

````markdown
# Refinement Engine

AI-gestützte Ticket-Verfeinerung: Ein Agent analysiert Tickets gegen die Codebase, stellt Rückfragen und liefert strukturierte Refinement-Ergebnisse.

## Starten

```bash
npm install
npm run dev
```

Startet die Next.js-App unter http://localhost:3000. Beim ersten Start mit leerer Datenbank werden drei Beispiel-Tickets eingefügt.

## Struktur

```
apps/
  web/            # Next.js (App Router): UI, Server Actions, SSE-Route – der einzige Prozess
packages/
  core/           # Fachkern nach Ports & Adapters (Domäne, Use Cases, Adapter für SQLite, Git, Claude CLI, Events)
  shared/         # Zod-Verträge zwischen Kern und UI (DTOs, Inputs, Events, Agent-Ausgabe)
```

Abhängigkeitsrichtung: `web → core → shared`. Domäne und Use Cases importieren keine Adapter; das prüft `npm run lint`.

## Voraussetzungen

- Node.js 20+
- `claude` CLI eingeloggt (`claude login`); das Binary kommt über `@anthropic-ai/claude-code` als Abhängigkeit von `packages/core`

## Befehle

| Befehl          | Zweck                                   |
|-----------------|-----------------------------------------|
| `npm run dev`   | Entwicklungsserver (http://localhost:3000) |
| `npm run build` | Typprüfung aller Pakete + `next build`  |
| `npm start`     | gebaute App starten                     |
| `npm test`      | alle Tests (Vitest)                     |
| `npm run lint`  | Abhängigkeitsregel des Hexagons         |

Die App läuft als ein dauerhafter Node-Prozess (lang laufende Agent-Prozesse, Event-Bus im Speicher, lokale SQLite). Serverless-Hosting wird nicht unterstützt (siehe [D19](docs/decisions.md)).
````

- [ ] **Step 2: `CLAUDE.md` ersetzen**

`CLAUDE.md` (komplett ersetzen):

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install all workspace dependencies
npm run dev          # Next.js dev server on :3000 (single process)
npm run build        # tsc --noEmit for packages + next build
npm test             # all workspace tests (Vitest)
npm run lint         # hexagon dependency rule (packages/core)

npm test -w packages/core                       # core only
npm test -w packages/core -- src/domain/rules   # single file / pattern
npm test -w apps/web                            # web only
npm test -w packages/shared                     # contracts only
```

### Database

```bash
# Run from packages/core — migrations apply automatically when the engine starts
npx drizzle-kit generate   # generate a migration after schema changes
```

## Architecture

**Refinement Engine** — an AI-powered tool that analyzes tickets against a codebase and produces structured implementation plans. npm workspaces monorepo, Ports & Adapters (hexagonal).

```
apps/web/         Next.js App Router — driving adapter: Server Components (read), Server Actions (write),
                  app/api/events/route.ts (SSE). lib/container.ts = composition root (engine singleton on globalThis)
packages/core/    domain/ (pure rules), ports/ (interfaces), application/ (use cases), adapters/ (sqlite, git,
                  claudeCli, nodeEvents), compose.ts (createRefinementEngine wires real adapters)
packages/shared/  Zod contracts: DTOs, inputs, RefinementEvent, agent output
```

Dependency direction: `web → core → shared`. `domain/`, `ports/`, `application/` must not import `adapters/`, `compose`, or I/O modules — enforced by `packages/core/eslint.config.mjs`.

### Request flow ("Refine")

1. Client calls `startRefinementAction(id, { repo, model, acceptanceCriteria })` (`apps/web/app/actions.ts`)
2. Use case `startRefinement` validates (Zod from `shared`), checks rules, sets `refining`, publishes a status event, hands `runInitialRefinement` to `runInBackground` and returns
3. Background job: `RepoProvider.ensureRepo` (git clone/pull into `$REPO_CACHE_DIR/<url-hash>/`) → `ensureSummary` (cached `codebase-summary-<commit>-<model>.md`) → `executeRun`
4. `AgentRunner.run` (`adapters/claudeCli`) spawns `claude --print --output-format stream-json`, parses progress, validates against `AgentOutputSchema`, retries once on schema errors
5. Output `question` → ticket stays `refining`, question event; user answers via `answerQuestionAction` → `runAnswer` with Q&A history. Output `refinement` → status `review`
6. Events reach the browser via `GET /api/events?ticketId=` → `subscribeToTicket`; the client appends progress and calls `router.refresh()` on status/question events

### Key modules

- `packages/core/src/application/createUseCases.ts` — the `UseCases` interface every adapter uses
- `packages/core/src/application/commands.ts`, `queries.ts`, `refinementJobs.ts`, `executeRun.ts` — use cases and background jobs
- `packages/core/src/domain/rules.ts` — status rules, Q&A history (`planAnswerRun`)
- `packages/core/src/domain/errors.ts` — `NotFoundError`/`ConflictError`/`ValidationError`; adapters check `errorCode(err)`, never `instanceof` (Next.js may duplicate modules across bundles)
- `packages/core/src/adapters/sqlite/schema.ts` — Drizzle schema: `tickets`, `agent_runs`, `audit_events`, `review_decisions`
- `packages/core/src/testing/fakes.ts` — in-memory repositories, `FakeAgentRunner`, `createTestContext()` for use-case tests
- `packages/core/skills/refinement-agent.md` — skill file included verbatim in every agent prompt

### Ticket status lifecycle

`backlog` → `refining` → `review` (success) or `failed` (error/timeout). Stopping a run reverts `refining` → `backlog`.

### Adding things

- **New use case**: function in `packages/core/src/application/`, add it to `UseCases` in `createUseCases.ts`, test with `createTestContext()`
- **New DB column/table**: `packages/core/src/adapters/sqlite/schema.ts`, `npx drizzle-kit generate` in `packages/core`, extend the port + both repository implementations (SQLite and in-memory fake)
- **New agent output field**: `packages/shared/src/refinementSchema.ts` and `packages/core/skills/refinement-agent.md`
- **New UI**: `apps/web/components/`; mutations as Server Actions in `apps/web/app/actions.ts` using `runAction`; UI primitives in `apps/web/components/ui/` (shadcn/Base UI, client components)

## Prerequisites & Environment

- Node.js 20+
- `claude` CLI authenticated (`claude login`)
- Runs as one long-lived Node process (`next dev` / `next start`); serverless hosting is not supported (D19)

| Variable                | Default                       | Purpose                                           |
|-------------------------|-------------------------------|---------------------------------------------------|
| `GITHUB_TOKEN`          | —                             | Injected into clone URLs for private repositories |
| `REPO_CACHE_DIR`        | `$TMPDIR/repo-cache`          | Where repos are cloned                            |
| `DB_PATH`               | `apps/web/data/refinement.db` | SQLite file path                                  |
| `REFINEMENT_TIMEOUT_MS` | `600000` (10 min)             | Max Claude subprocess runtime                     |
````

- [ ] **Step 3: D19 im Entscheidungslog**

In `docs/decisions.md` unter der Überschrift `## D2 — Stack: TypeScript end-to-end (2026-06-10)` direkt nach der Überschriftzeile einfügen:

```markdown

> **Teilweise ersetzt durch [D19]** — Vite/React-Frontend und separates Node-Backend sind durch eine
> Next.js-App mit Hexagonal-Kern abgelöst; „TypeScript end-to-end“ gilt weiter.
```

Am Dateiende anhängen:

```markdown

## D19 — Next.js als einziger Prozess, Fachkern nach Ports & Adapters (2026-10-28)

Ersetzt in D2 „Vite/React-Frontend“ und das separate Node-Backend. Die App läuft als **eine Next.js-App**
(App Router): Server Components lesen, Server Actions schreiben, ein Route Handler streamt SSE. Die Fachlogik
liegt in `packages/core` nach **Ports & Adapters** (Domäne, Use Cases, Ports; Adapter für SQLite/Drizzle, Git,
Claude CLI und den In-Process-Event-Bus); `packages/shared` hält die Zod-Verträge. Hono war nur eine
Zustell-Schicht (~280 von ~1.700 Zeilen Backend-Code) und wurde als Adapter ausgetauscht.

Begründung: ein Prozess und ein Start-Befehl passen zur lokalen Pro-Nutzer-App (D17); Next.js gehört zum
Ziel-Stack. Hexagonal statt Clean/Onion, weil die Fachlogik schmal ist, die Zahl der Ränder aber wächst
(Postgres und prozessübergreifende Events in Phase 3, Integrationsadapter nach D12); Ports gibt es nur an
heute existierenden Rändern. Die Abhängigkeitsrichtung erzwingt eine ESLint-Regel.

Bewusst akzeptierte Trade-offs: **kein Serverless-Hosting** — Agent-Läufe sind lang laufende Kindprozesse,
der Event-Bus lebt im Speicher eines Prozesses, die Datenbank ist eine lokale Datei. Lang laufende Läufe
starten fire-and-forget aus Server Actions im Node-Prozess von `next start`. Die Engine ist ein Singleton
auf `globalThis`, weil Next.js Module in mehreren Bundles lädt; Fachfehler werden deshalb über ein
`code`-Feld statt `instanceof` erkannt. Der Wechsel von der CLI auf das Claude Agent SDK ist als eigener
Schritt geplant und betrifft nur den Adapter hinter dem Port `AgentRunner`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/decisions.md
git commit -m "docs: README, CLAUDE.md und D19 für Next.js + Hexagonal-Kern

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Abschluss-Abnahme (Spec Abschnitt 10)

- [ ] **Step 1: Frische Installation, Tests, Build, Lint**

```bash
rm -rf node_modules apps/web/node_modules packages/*/node_modules apps/web/.next
npm install && npm test && npm run build && npm run lint
```
Expected: alles grün.

- [ ] **Step 2: Ein Prozess, eine URL**

Run (im Hintergrund): `npm run dev`
Expected: genau ein Next.js-Prozess; `Local: http://localhost:3000`. Prüfen: `lsof -iTCP:3000 -sTCP:LISTEN` zeigt einen `node`-Prozess; auf :3001 und :5173 lauscht nichts aus diesem Repo.

- [ ] **Step 3: Smoke-Test**

```bash
curl -s http://localhost:3000/ | grep -o 'CC-[123]: [^<]*' | sort -u
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tickets/T-1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tickets/T-999
curl -s -N --max-time 2 "http://localhost:3000/api/events?ticketId=T-1"; echo
```
Expected: drei Seed-Titel; `200`; `404`; `: ok`.

Danach im Browser (oder per headless-Chrome-Screenshot) die Parität aus Teil 2, Task 7, Step 4 wiederholen. Echter Agent-Lauf nur nach Zustimmung des Nutzers.

- [ ] **Step 4: Typ-Vertrag im Browser-Code**

Run: `grep -rn "interface Ticket\b\|interface AgentRun\b\|type SseMessage" apps/web --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: keine Treffer – alle API-Typen kommen aus `@refinement/shared`.

- [ ] **Step 5: Abhängigkeitsregel greift weiterhin**

```bash
printf "import { createSqliteDatabase } from '../adapters/sqlite/database'\nexport const x = createSqliteDatabase\n" > packages/core/src/domain/lintProbe.ts
npm run lint -w packages/core; echo "exit=$?"
rm packages/core/src/domain/lintProbe.ts
```
Expected: Fehlermeldung `Hexagonal: Domäne, Ports und Use Cases dürfen keine Adapter importieren.` und `exit=1`.

- [ ] **Step 6: Dev-Server stoppen, Ergebnis berichten**

Dev-Server beenden. `git status --short` muss leer sein. Dem Nutzer berichten: Branch `feature/nextjs-hexagonal` ist fertig (nicht gepusht); nächste Schritte zur Wahl: Push + Pull Request, oder Spec 2 (Claude Agent SDK als neuer `AgentRunner`-Adapter).
