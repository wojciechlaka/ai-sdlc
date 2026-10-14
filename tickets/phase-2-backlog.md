# Phase 2 — Implementierungs-Backlog

Setzt **Phase 2** der [Feature-Roadmap](../docs/feature-roadmap.md) um (repo-basiertes
Refinement-MUP). Spätere Phasen erhalten jeweils einen eigenen Backlog (`phase-3-backlog.md` …).

Stand: 2026-06-10. Etappenschnitt gemäß [D1](../docs/decisions.md), Datenmodell siehe
[docs/datenmodell.md](../docs/datenmodell.md). Tickets werden top-down abgearbeitet;
jede Etappe liefert etwas tatsächlich Benutzbares.

Status-Legende: `[ ]` offen · `[~]` in Arbeit · `[x]` fertig

---

## E1 — Refinement-Spike (headless, kein UI, keine DB)

Ziel: Beweisen, dass eine Coding-Agent-CLI als Refinement-Engine taugt, bevor irgendetwas
drumherum gebaut wird.

### [ ] T-1: Projekt-Setup

TypeScript-Monorepo-Grundgerüst (npm workspaces): `packages/shared`, `apps/backend`
(Frontend kommt in E3). tsconfig, Lint/Format, `npm run dev`-Skripte.

**Akzeptanzkriterien:**
- `npm install && npm run build` läuft auf einem frischen Checkout durch.
- Gemeinsame Typen aus `packages/shared` sind im Backend importierbar.

### [ ] T-2: Refinement-Output-Schema

Zod-Schema für den strukturierten Agent-Output in `packages/shared`:
`userStory`, `acceptanceCriteria[]`, `openQuestions[]`, `risks[]` (mit Severity),
`affectedFiles[]`, `confidence` (siehe [Datenmodell](../docs/datenmodell.md)).

**Akzeptanzkriterien:**
- Schema validiert gültige Beispiel-Outputs und weist ungültige mit verständlichem Fehler ab.
- Typen werden aus dem Schema abgeleitet (kein doppelt gepflegtes Interface).

### [ ] T-3: Agent-CLI-Wrapper

Schmale, austauschbare Schnittstelle (D3) `runRefinement(ticket, repoPath, feedback?)`,
die `claude -p` headless mit JSON-Output aufruft: Prompt-Template baut Ticket + ggf.
Feedback + vorherigen Output ein; Arbeitsverzeichnis ist das ausgecheckte Ziel-Repo;
Antwort wird geparst und gegen das Schema aus T-2 validiert. Timeout und ein Retry
bei Schema-Verletzung.

**Akzeptanzkriterien:**
- Wrapper liefert bei Erfolg einen schema-validierten Output plus Metadaten (Modell, Dauer, Kosten/Tokens).
- Timeout und CLI-Fehler führen zu unterscheidbaren, getypten Fehlern (kein stilles Hängen).
- Die CLI-spezifische Logik ist in einem Modul gekapselt; der Rest des Codes kennt nur die Schnittstelle.

### [ ] T-4: Spike end-to-end gegen das Beispiel-Repo

Skript, das ein Seed-Ticket aus [examples/tickets/](../examples/tickets/) einliest, das
coffee-chat-Repo klont bzw. aktualisiert, den Wrapper aufruft und das Ergebnis als JSON
ablegt. Anschließend Qualitäts-Check von Hand mit allen drei Seed-Tickets.

**Akzeptanzkriterien:**
- Ein Kommando refined ein beliebiges der drei Seed-Tickets end-to-end.
- Alle drei Outputs referenzieren reale Dateien/Konzepte aus dem Repo (z. B. In-Memory-State bei CC-3).
- Kurzes Fazit im Ticket dokumentiert: Taugt der Output? Wo sind Grenzen? (Entscheidungsgrundlage, ob die CLI reicht — D3.)

---

## E2 — Datenmodell + Backend + Persistenz („Kanban als JSON")

Ziel: Plattform ist per HTTP end-to-end benutzbar, alles persistent und auditierbar.

### [ ] T-5: SQLite-Schema und Datenzugriff

Tabellen `ticket`, `agent_run`, `review_decision`, `audit_event` gemäß
[Datenmodell](../docs/datenmodell.md), inkl. Migrations-Mechanismus (einfach reicht).

**Akzeptanzkriterien:**
- DB wird beim ersten Start automatisch angelegt/migriert.
- Statusübergänge des Tickets sind nur gemäß State Machine möglich (ungültige Übergänge werfen Fehler).

### [ ] T-6: Ticket-API + Board-JSON

REST-API: Ticket anlegen, lesen, Liste; `GET /board` liefert Tickets gruppiert nach
Status — das „Kanban als JSON"-Minimum-Usable-Product.

**Akzeptanzkriterien:**
- Ticket anlegen per `curl` möglich; Pflichtfelder werden validiert.
- `GET /board` zeigt alle Tickets in ihren Spalten inkl. Iteration und letztem Run-Status.
- Jede Mutation erzeugt ein AuditEvent.

### [ ] T-7: Asynchrone Run-Ausführung

`POST /tickets/:id/refine` startet einen AgentRun (D4): Ticket → `refining`, Run läuft im
Hintergrund über den Wrapper aus T-3, bei Erfolg → `review`, bei Fehler/Timeout → `failed`.
`GET /tickets/:id` bzw. `GET /runs/:id` liefern den aktuellen Stand.

**Akzeptanzkriterien:**
- Ein Refine-Aufruf kehrt sofort zurück; der Status ist per Polling beobachtbar.
- Erfolgreicher Run persistiert Output + Metadaten am AgentRun; Ticket steht in `review`.
- Fehlgeschlagener Run hinterlässt Fehlerdetails am Run; Ticket steht in `failed` und kann erneut angestoßen werden.
- Parallele Refine-Aufrufe auf dasselbe Ticket werden abgelehnt.

---

## E3 — Mini-Frontend: Kanban-Board

Ziel: Erstes vorzeigbares Produkt — echt, nicht simuliert.

### [ ] T-8: Board-Ansicht

Vite/React-App: vier Spalten (`Backlog`, `Refining`, `Review`, `Ready`), Ticket-Karten mit
Titel, Iteration, Run-Status; Polling auf `GET /board`. `failed` wird als Badge auf der
Karte dargestellt, nicht als eigene Spalte.

**Akzeptanzkriterien:**
- Board spiegelt den Backend-Zustand ohne Reload (Polling-Intervall ≤ 5 s).
- Laufende Runs sind als solche erkennbar (Spinner/Badge).

### [ ] T-9: Ticket anlegen + Refinement starten

Formular für neue Tickets (Titel + Beschreibung); „Refine"-Button auf Backlog-Karten
(und Retry auf `failed`).

**Akzeptanzkriterien:**
- Ticket anlegen und Refinement starten funktioniert komplett aus dem UI.
- Während eines laufenden Runs ist der Button deaktiviert.

### [ ] T-10: Ticket-Detail-Drawer

Klick auf Karte öffnet Drawer: Beschreibung, aktueller Agent-Output (User Story,
Akzeptanzkriterien, offene Fragen, Risiken, betroffene Dateien, Confidence), Run-Metadaten.

**Akzeptanzkriterien:**
- Der komplette strukturierte Output ist lesbar dargestellt.
- Bei Tickets ohne erfolgreichen Run zeigt der Drawer einen sinnvollen Leerzustand.

---

## E4 — Human-in-the-Loop: Review-Schleife

Ziel: Das Produktversprechen (kontrollierter Agentic Workflow) ist real erlebbar.

### [ ] T-11: Review-API

`POST /tickets/:id/review` mit `decision: approve | request_changes` und optionalem
Feedback. Approve → `ready`; Request Changes → `refining` und automatischer Rework-Run.
Persistiert als ReviewDecision (D7) + AuditEvent.

**Akzeptanzkriterien:**
- Review ist nur im Status `review` möglich.
- `request_changes` ohne Feedback wird abgelehnt.

### [ ] T-12: Rework-Run mit Feedback-Kontext

Rework-Runs (`trigger: rework`) bekommen Feedback + vorherigen Output als Input;
`iteration` am Ticket zählt hoch.

**Akzeptanzkriterien:**
- Der neue Output adressiert das Feedback erkennbar (Stichprobe mit Seed-Tickets).
- Input des Runs dokumentiert nachvollziehbar, was an die CLI ging.

### [ ] T-13: Review-UI + Audit-Trail

Approve/Request-Changes-Buttons (mit Feedback-Feld) im Drawer; darunter chronologischer
Audit-Trail des Tickets aus den AuditEvents.

**Akzeptanzkriterien:**
- Die komplette Review-Schleife (refine → review → request changes → rework → approve) ist aus dem UI durchspielbar.
- Der Audit-Trail zeigt Akteur, Aktion und Zeitpunkt jedes Schritts.

---

## E5 — Härtung & Konfiguration

Ziel: Demo-fähig vor Publikum; vorbereitet auf Austausch der Agent-CLI.

### [ ] T-14: Ziel-Repo konfigurierbar

Repo-URL und Checkout-Verhalten (clone/pull, Ziel-Verzeichnis) als Konfiguration (D8)
statt hartkodiert; Backend verwaltet den Checkout selbst.

**Akzeptanzkriterien:**
- Wechsel auf ein anderes Repo erfordert nur eine Config-Änderung und Neustart.
- Fehlende/ungültige Repo-Config führt zu klarer Fehlermeldung beim Start.

### [ ] T-15: Live-Progress des Agenten

CLI im Stream-Modus (`stream-json`) anbinden; Fortschritts-Events am Run speichern und
per SSE (oder Polling-Fallback) im Drawer anzeigen.

**Akzeptanzkriterien:**
- Während eines Runs sind die Agent-Schritte live im Drawer sichtbar.
- Abgeschlossene Runs zeigen das vollständige Schritt-Protokoll.

### [ ] T-16: Fehlerzustände im UI

Timeout, CLI-Fehler und Schema-Verletzungen werden im Board und Drawer verständlich
dargestellt, inkl. Retry.

**Akzeptanzkriterien:**
- Jeder Fehlertyp aus T-3 hat eine eigene, verständliche Darstellung.
- Retry aus dem UI startet einen neuen Run mit korrekter Iteration.

### [ ] T-17: Ticket-Import aus Markdown

Import-Kommando oder Endpoint, das Ticket-Markdown-Dateien (Format wie
[examples/tickets/](../examples/tickets/)) als Tickets in `backlog` anlegt.

**Akzeptanzkriterien:**
- Die drei Seed-Tickets lassen sich mit einem Kommando importieren.
- Doppelter Import derselben Datei erzeugt keine Duplikate.
