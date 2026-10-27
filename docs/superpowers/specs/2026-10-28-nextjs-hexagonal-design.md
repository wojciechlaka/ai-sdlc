# Design: Next.js + Hexagonal-Kern (Spec 1)

Datum: 2026-10-28 · Status: abgestimmt, bereit für Implementierungsplan

## 1. Ziel und Kontext

Die Refinement Engine (Phase 2) läuft heute als zwei Prozesse: Hono-Backend (`apps/backend`, :3000)
und Vite/React-Frontend (`apps/frontend`, :5173). Ziel dieses Specs:

- **Next.js wird der einzige Prozess** – UI und treibender Adapter (Server Components, Server Actions,
  Route Handlers). Hono und Vite entfallen.
- **Der Fachkern wird nach Hexagonal (Ports & Adapters) herausgelöst** (`packages/core`), unabhängig
  von HTTP und Framework.
- `packages/shared` wird zum **gemeinsamen API-Vertrag** (Zod) zwischen Kern und UI.
- Der Event-Bus wird **typisiert**; das Frontend bekommt **Tests**.

Motivation: Next.js ist Teil des Ziel-Stacks; ein Prozess ist für die lokale Pro-Nutzer-App (D17)
einfacher als zwei. Hono war nur Zustell-Schicht (~280 von ~1.700 Zeilen Backend-Code); der Rest ist
bereits HTTP-frei und zieht weitgehend unverändert in den Kern.

### Nicht-Ziele (bewusst ausgeschlossen)

- Claude Agent SDK statt CLI-Spawn → **eigenes Spec 2** (Port `AgentRunner` macht den Austausch lokal).
- Hosting auf Vercel / Serverless, Replay-Demo, Video.
- Mehrere SSE-Verbindungen pro Ticket (bekannte Schwäche, s. Abschnitt 10).
- Verhaltensänderungen an Fachregeln – Schritt 1 ist ein reines Refactoring.
- E2E-Tests (Playwright).

## 2. Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| a | Alles in Next.js, kein separates Backend | ein Prozess, ein Start-Befehl; Hono war nur Adapter |
| b | Hexagonal (pragmatisch), nicht Clean/Onion | schmale Fachlogik, viele externe Ränder (CLI, Git, DB, Events; später Postgres, Jira/MCP – D12) |
| c | Ports nur an heute existierenden Rändern | YAGNI; keine Presenter/Interactor-Rituale |
| d | Adapter liegen in `packages/core/adapters/`, keine Extra-Pakete | Größe rechtfertigt keine vier weiteren Pakete; Grenze per Lint-Regel |
| e | Migration „Kern zuerst, dann Next“ (3 Schritte) | jeder Schritt lauffähig und verifiziert |
| f | Kein Serverless | lang laufende Kindprozesse, In-Process-Event-Bus, lokale SQLite |

Wird als **D19** in `docs/decisions.md` festgehalten (ersetzt in D2 „Vite/React-Frontend“ und das
separate Node-Backend).

## 3. Architektur und Paketstruktur

```
apps/web/                         Next.js (App Router) – der einzige Prozess
├─ instrumentation.ts             register(): beim Serverstart Migrationen + Seed
├─ app/                           treibende Adapter (dünn, keine Fachlogik)
│  ├─ layout.tsx, page.tsx, tickets/[id]/page.tsx    Server Components → Use Cases (lesen)
│  ├─ actions.ts                  Server Actions → Use Cases (schreiben), Zod-Prüfung
│  └─ api/events/route.ts         SSE: abonniert EventPublisher, streamt an den Browser
├─ components/, hooks/            UI
└─ lib/container.ts               Composition Root (Ports ↔ Adapter), Singleton auf globalThis

packages/core/                    Fachkern + getriebene Adapter, kennt kein HTTP/Next
├─ domain/                        Ticket, AgentRun, Status-Regeln, Fehlertypen (rein, ohne I/O)
├─ application/                   Use Cases (eine Datei pro Use Case)
├─ ports/                         AgentRunner, RepoProvider, TicketRepository,
│                                 AgentRunRepository, AuditLog, EventPublisher
└─ adapters/                      claudeCli/, git/, sqlite/ (Drizzle), nodeEvents/

packages/shared/                  Zod-Verträge (Agent-Ausgabe, API-DTOs, Inputs, Events)
```

**Abhängigkeitsregel:** `web → core → shared`. `domain/` und `application/` importieren nur `ports/`,
`domain/` und `shared` – nie `adapters/`. Durchgesetzt per ESLint `no-restricted-imports`.

**Next-Konfiguration:** `transpilePackages: ['@refinement/core', '@refinement/shared']`,
`serverExternalPackages: ['better-sqlite3']`.

**Prozessmodell:** Agent-Läufe werden aus Server Actions fire-and-forget gestartet und laufen im
Node-Prozess von `next dev`/`next start` weiter. Der Container (inkl. Event-Bus und laufender
Prozesse) ist ein Singleton auf `globalThis`, damit Hot Reload im Dev ihn nicht dupliziert.

## 4. Domäne, Use Cases, Ports

Fachregeln, die heute in `restApi.ts` stecken (zulässige Status, Statuswechsel), ziehen in den Kern.

### `domain/`

```ts
type TicketStatus = 'backlog' | 'refining' | 'review' | 'ready' | 'failed'
canStartRefinement(ticket)        // status ∈ { backlog, review }
canAnswer(ticket, runs)           // refining + offene Frage + kein laufender Antwort-Lauf
canDelete(ticket)                 // status ≠ refining
nextStatusAfterRun(output)        // question → refining bleibt, refinement → review
```

Fehlertypen: `NotFoundError`, `ConflictError`, `ValidationError`.

### `application/`

| Use Case | Verhalten | Herkunft |
|---|---|---|
| `listTickets`, `getTicket` | Ticket-DTOs; Detail inkl. letztem Lauf | `restApi.ts` |
| `createTicket` | anlegen + Audit `ticket_created` | `restApi.ts` |
| `startRefinement` | prüfen → `refining` + Event → `executeRun` im Hintergrund → sofort zurück | `restApi.ts`, `refinementOrchestrator.ts` |
| `answerQuestion` | prüfen → Q&A-Verlauf aufbauen → `executeRun` im Hintergrund | beide |
| `stopRefinement` | Prozess stoppen, nach Wartezeit `refining` → `backlog` | `restApi.ts` |
| `deleteTicket` | nur wenn nicht `refining` | `restApi.ts` |
| `resetSystem` | laufende stoppen, Seeds wiederherstellen | `restApi.ts` |
| `executeRun` (intern) | Repo → Summary → Agent → Lauf/Audit/Status/Events | `refinementOrchestrator.ts` |

Use Cases erhalten ihre Ports per Parameter/Factory (`createUseCases(deps)`).

### `ports/`

```ts
interface AgentRunner {
  run(input: RefinementInput, onProgress: (msg: string) => void): Promise<{ output: AgentOutput; meta: RunMeta }>
  stop(ticketId: string): boolean
}
interface RepoProvider {
  ensureRepo(url: string): Promise<string>
  ensureSummary(dir: string, model: string, onProgress: (msg: string) => void): Promise<string | null>
}
interface TicketRepository   { list; get; create; updateStatus; delete; resetToSeeds }
interface AgentRunRepository { create; complete; fail; listForTicket; latestForTicket }
interface AuditLog           { append(event) }
interface EventPublisher {
  publish(event: RefinementEvent): void
  subscribe(ticketId: string, handler: (event: RefinementEvent) => void): () => void
}
```

Adapter: `claudeCli/` (heute `agentCli/`), `git/` (heute `repoCache.ts`), `sqlite/` (heute `db/`),
`nodeEvents/` (heute `events.ts`).

## 5. Next.js-Schicht (`apps/web`)

```
app/
├─ layout.tsx               Server  linke Spalte: RepoSettings, „Neues Ticket“, Reset, TicketList;
│                                    umschließt alles mit <ProgressLogProvider> (Client)
├─ page.tsx                 Server  „Ticket auswählen oder neu erstellen“
├─ tickets/[id]/page.tsx    Server  getTicket(id) → <TicketDetail>; unbekannt → notFound()
├─ error.tsx, not-found.tsx
├─ actions.ts               Server  createTicket, startRefinement, answerQuestion,
│                                    stopRefinement, deleteTicket, resetSystem
└─ api/events/route.ts      Server  SSE
```

- **Lesen:** Server Components rufen Use Cases direkt auf (kein `fetch` auf eine eigene API).
- **Schreiben:** Server Action → `Schema.parse` → Use Case → `revalidatePath`. `ConflictError` /
  `ValidationError` → `{ ok: false, error }`, sonst `{ ok: true }`.
- **SSE:** `GET /api/events?ticketId=…`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
  `ReadableStream`: initialer Ping, `subscribe(ticketId)`, jedes Event als `data: <json>\n\n`;
  bei `request.signal` abort → Abmelden und Stream schließen.
- **Client-Auffrischung:** `useSSE` (neue URL, Typen aus `shared`). Bei `status`/`question` und nach
  Reconnect → `router.refresh()`. Ersetzt das 5-Minuten-Polling.
- **Client-Komponenten:** `RepoSettings`, `CreateTicketDialog`, `ModelSelect`, `TicketLive`
  (SSE, Timer, Start/Stop, Fortschritts-Log), `QuestionPanel`, `AgentRunningCard`.
  **Server Components:** `TicketList` (Links statt `onSelect`), `TicketMetaRow`, statischer Teil von
  `TicketDetail`.
- **Unverändertes Verhalten:** Repo-URL bleibt in `localStorage` und geht als Formularfeld mit;
  Fortschritts-Logs pro Ticket liegen im `ProgressLogProvider` des Root-Layouts und überleben
  Navigation wie heute in `App.tsx`. shadcn-UI, Tailwind v4, Geist ziehen mit um.
- UI-Konstanten (Modelle, Preise, Status-Labels) → `apps/web/lib/`.

## 6. Vertrag und typisierter Event-Bus

`packages/shared/src/`:

```
refinementSchema.ts   AgentOutputSchema, RefinementOutputSchema            (bestehend)
api.ts                TicketStatusSchema, TicketSchema (id: "T-1"), AgentRunSchema,
                      TicketDetailSchema, CreateTicketInput,
                      StartRefinementInput { repo: url, model, acceptanceCriteria? },
                      AnswerInput { answer: nicht leer }
events.ts             RefinementEventSchema = discriminatedUnion('type', [
                        { type: 'progress', ticketId, message },
                        { type: 'question', ticketId, question },
                        { type: 'status',   ticketId, status } ])
```

- Use Cases liefern DTOs aus `shared`; ID-Formatierung (`"T-1"`) im Kern, nicht in der UI.
- Server Actions parsen Inputs; der Kern verarbeitet nur geprüfte Daten.
- Von Hand nachgebaute Typen im Frontend (`Ticket`, `AgentRun`, `SseMessage`) entfallen.
- `nodeEvents`-Adapter: `EventEmitter` mit Kanal pro Ticket (`ticket:<id>`), `setMaxListeners(0)`,
  `subscribe` gibt eine Abmelde-Funktion zurück. Die SSE-Nachricht ist das `RefinementEvent`.

### Datenfluss „Refinement starten“

```
Browser  Formular → startRefinementAction(id, formData)
Next     StartRefinementInput.parse → container.startRefinement(id, input)
Core     canStartRefinement → tickets.updateStatus('refining') → events.publish(status)
         → executeRun(...) im Hintergrund (nicht awaited; Fehler intern behandelt)
         ← sofort zurück; Action: revalidatePath
Core     executeRun: repo.ensureRepo → repo.ensureSummary → agent.run(onProgress → publish(progress))
         → runs.complete + audit.append → publish(question) | updateStatus('review') + publish(status)
Next     /api/events: subscribe(id) → data:{…}
Browser  useSSE → TicketLive; bei status/question → router.refresh()
```

## 7. Fehlerbehandlung

- **Hintergrund-Läufe:** `executeRun` fängt alles ab → Lauf `failed`/`timeout`, Ticket `failed`,
  Fortschrittsmeldung „Fehler: …“. Keine unbehandelte Promise-Ablehnung im Next-Prozess
  (zusätzliches `.catch` mit Log am Aufrufpunkt).
- **Fachfehler:** Server Action → `{ ok: false, error }`; Seite → `notFound()`.
- **Unerwartet:** `error.tsx` + Server-Log.
- **Start:** `instrumentation.ts` führt Migrationen + Seed aus; Fehler bricht den Start mit klarer
  Meldung ab.

## 8. Tests (Vitest)

| Ebene | Inhalt | Mittel |
|---|---|---|
| `core/domain` | Status-Regeln, Invarianten | Unit-Tests |
| `core/application` | alle Use Cases inkl. Q&A-Verlauf, Stop, Fehlerpfade | Fake-Adapter: In-Memory-Repos, `FakeAgentRunner`, `FakeRepoProvider`, aufzeichnender `EventPublisher` |
| `core/adapters` | SQLite (In-Memory-DB), `claudeCli`-Parsing, `nodeEvents` | bestehende Tests migriert |
| `shared` | Schemas | bestehend + neue Verträge |
| `web` | `useSSE` (Mock-`EventSource`), `QuestionPanel`, `CreateTicketDialog`, `TicketLive`; Server Actions mit Test-Container; SSE-Route (publish → Stream lesen) | jsdom + Testing Library |

`restApi.test.ts` und `sseLayer.test.ts` werden durch Use-Case- bzw. SSE-Route-Tests ersetzt.

## 9. Migrationsschritte

Auf einem Feature-Branch; jeder Schritt mit eigenem Commit/PR und grünem `npm test`.

1. **Kern:** `packages/core` (Domäne, Use Cases, Ports, Adapter, typisierter Bus); `shared` als
   API-Vertrag. `apps/backend` wird dünner Hono-Adapter auf dem Kern; `apps/frontend` unverändert.
   *Fertig:* alle Tests grün, alte App verhält sich identisch.
2. **Next.js:** `apps/web` gemäß Abschnitt 5 inkl. Frontend-Tests.
   *Fertig:* funktionale Parität mit der alten App (beide parallel, Next auf eigenem Port).
3. **Aufräumen:** `apps/frontend` und `apps/backend` löschen; Root-`npm run dev` → `next dev`,
   `concurrently`/`wait-on` entfernen; README, CLAUDE.md aktualisieren; **D19** eintragen.

## 10. Abnahme

- `npm install && npm run dev` startet **einen** Prozess; App unter einer URL erreichbar.
- Board, Ticket-URL, Ticket anlegen, Refinement mit Live-Fortschritt, Rückfrage beantworten,
  Ergebnis, Stop, Löschen, Reset verhalten sich wie vorher.
- `npm test` und `npm run build` grün; Lint-Regel zur Abhängigkeitsrichtung schlägt bei Verstoß an.
- Keine von Hand nachgebauten API-Typen im Browser-Code.
- Manueller Smoke-Test mit echtem Agent-Lauf nur nach Zustimmung (verbraucht Tokens).

## 11. Bekannte Punkte (bewusst unverändert)

- Tickets im Status `failed` lassen sich nicht erneut verfeinern.
- „Stop“ wartet eine feste Zeit (`STOP_SETTLE_MS`) statt auf das Prozessende.
- Nur eine SSE-Verbindung pro Ticket: eine neue ersetzt die alte (wird im neuen `EventPublisher`
  durch `subscribe` pro Verbindung faktisch behoben – ist aber kein Ziel und wird nicht eigens getestet).
- Fortschrittsmeldungen sind flüchtig; nach Reconnect fehlen verpasste Meldungen.
- Event-Bus nur innerhalb eines Prozesses; für Phase 3 (T-8) wird ein prozessübergreifender Adapter
  nötig (z. B. Postgres `LISTEN/NOTIFY`).

## 12. Folge-Spec

**Spec 2 – Claude Agent SDK:** neuer `AgentRunner`-Adapter auf `@anthropic-ai/claude-agent-sdk`
(Sitzungen/`resume` für die Q&A-Schleife, `outputFormat` mit JSON-Schema, Hooks für Fortschritt,
`AbortController`). Offene Frage: Authentifizierung per API-Key statt claude.ai-Abo.
