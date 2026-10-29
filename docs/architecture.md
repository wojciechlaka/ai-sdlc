# Architektur

Grundsatzentscheidungen: [decisions.md](decisions.md) · Stufen und Ausblick:
[feature-roadmap.md](feature-roadmap.md) · Datenmodell: [datenmodell.md](datenmodell.md)

## 1. Überblick

**Zielbild:** Eine lokale Next.js-App führt Tickets durch die Stufen des AI-Native SDLC Playbooks. Agenten
schreiben die Artefakte, Menschen geben per PR frei. Die Inhalte liegen im Git-Repo des Teams, die App hält
nur Zustand und Log (§3). Heute verfeinert die App Tickets und speichert das Ergebnis in der Datenbank (§4);
der Umbau auf das Arbeitsmodell folgt (§5). Das Übersichtsbild: [architecture.png](architecture.png), erläutert in
[architecture-annotated.png](architecture-annotated.png).

## 2. Prinzipien

- **Eine Quelle pro Information:** Inhalte in Git, Zustand und Log in der App-Datenbank (E1).
- **Gate per PR:** Ein Mensch merged; der Merge ist der Übergang zur nächsten Stufe (E1).
- **Kern ohne Framework:** Fachlogik in `packages/core`, jeder Rand ein Adapter hinter einem Port (E2).
- **Agent als Werkzeug:** Coding-Agent als CLI hinter `AgentRunner`, austauschbar (E3).
- **Keine Secrets in der App:** Credentials bleiben beim Nutzer (E4).

## 3. Arbeitsmodell (Zielbild)

So soll die App nach dem Umbau (§5) arbeiten:

```text
  Ticket-Eingang                     Ziel-Repo (Git)                         App (DB)
  +----------------+        +----------------------------------+      +--------------------+
  | Jira o. A. /   |        | Branch CB-3/intent               |      | Ticket CB-3        |
  | examples/      | -----> |   docs/work/CB-3/intent.md       | <--> |   Stufe: Plan      |
  | tickets/*.md   |        |   PR  --(Merge)-->  main         |      |   Log: Laeufe,     |
  +----------------+        | Branch CB-3/spec                 |      |   Rueckfragen,     |
                            |   docs/work/CB-3/spec.md         |      |   Freigaben,       |
                            |   PR  --(Merge)-->  main         |      |   Uebergaenge      |
                            +----------------------------------+      +--------------------+
                                     ^                                          |
                                     |   Agent schreibt Datei, oeffnet PR;      |
                                     +-- App fragt Merge-Status ab -------------+
```

- **Stufe pro Ticket:** Jedes Ticket wird eine Stufe haben: Plan → Design (Showcase), danach Build, Test,
  Deploy, Maintain (Ausblick).
- **Agent und App:** Der Agent liest das Ticket und schreibt die Artefakte ins Repo; die App startet ihn und
  führt den Zustand.
- **Übergang:** Ist der PR einer Stufe gemergt, wird die App die nächste Stufe setzen und einen Log-Eintrag
  schreiben. Da eine lokale App keine Webhooks empfängt, wird sie den Merge-Status über die Git-Host-API
  abfragen.
- **Ticket-Eingang:** Ein Ticket-System soll nur den rohen Inhalt liefern; einen Inhalts-Spiegel zurück wird
  es nicht geben.

## 4. Ist-Architektur

Alles auf einer Maschine, **ein** Prozess (E2).

```text
   +=============================== eine Maschine ===============================+
   |  Browser                                                                    |
   |    | RSC-Seiten (lesen)    Server Actions (schreiben)    EventSource (SSE)  |
   |    v                                                                        |
   |  apps/web  --  Next.js 16, ein Node-Prozess (next dev / next start)         |
   |    lib/container.ts = Composition Root (Engine-Singleton auf globalThis)    |
   |    |                                                                        |
   |    v                                                                        |
   |  packages/core  --  Hexagon                                                 |
   |    application (Use Cases)  -->  domain (Regeln, Fehler)                    |
   |    ports:    TicketRepository . AgentRunRepository . AuditLog               |
   |              AgentRunner . RepoProvider . EventPublisher                    |
   |    adapters: sqlite (Drizzle) . git (Repo-Cache) . claudeCli . nodeEvents   |
   |    |               |                   |                                    |
   |    v               v                   v                                    |
   |  SQLite       Repo-Checkout       "claude --print" (E3)                     |
   |  Secrets: lokal (Claude-Login, optional GITHUB_TOKEN)                       |
   +=============================================================================+
```

*Abb. 1 — Ist-Architektur ([E2](decisions.md), [E3](decisions.md)).*

**Schichten.** `apps/web` ist der treibende Adapter: Server Components rufen Use Cases direkt auf, Server
Actions schreiben, `app/api/events/route.ts` streamt Ereignisse. `packages/core` enthält die Fachlogik;
`domain/`, `ports/` und `application/` importieren weder Adapter noch I/O — das prüft eine ESLint-Regel.
`packages/shared` hält die Zod-Verträge (DTOs, Inputs, Events, Agent-Ausgabe), die Kern und UI teilen.

**Refine-Fluss heute.** Server Action → Use Case validiert, setzt `refining`, veröffentlicht ein
Status-Event und startet den Lauf im Hintergrund → Repo klonen/aktualisieren → Codebase-Summary →
`claude --print` → Ergebnis (Rückfrage oder Refinement) → Status/Audit → Events über den `EventPublisher` an
die SSE-Route → Browser aktualisiert Fortschritt und lädt bei Status-/Fragen-Events die Seite neu.

**Grenzen.** Ein dauerhafter Node-Prozess ist Voraussetzung: lang laufende Kindprozesse, Event-Bus im
Speicher, lokale SQLite-Datei — **kein Serverless-Hosting** (E2). Die Zustandsmaschine des Tickets steht in
[datenmodell.md](datenmodell.md).

**Beispiel-Ziel.** Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)),
Beispiel-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

## 5. Was sich für den Showcase ändert

Der nächste Umbau bringt die App vom heutigen Refinement auf Stufe 1 und 2 des Arbeitsmodells (Details im
eigenen Spec):

- **Ticket-Eingang:** Tickets werden aus `examples/tickets/*.md` eingelesen; die Ticket-ID ist der Schlüssel.
- **Git-Adapter schreibt:** Branch `<TICKET>/<stufe>`, Datei `docs/work/<TICKET>/<artefakt>.md`, PR — mit dem
  Git-Host-Token des Nutzers (E4).
- **Stufe statt Status:** Das Ticket kennt seine Playbook-Stufe; das Ergebnis liegt als Datei im Repo statt
  als JSON in der Datenbank.
- **Merge-Erkennung:** Die App fragt den PR-Status ab und schaltet beim Merge die Stufe weiter.
- **Log pro Ticket:** Jeder Lauf, jede Rückfrage, jede Freigabe und jeder Übergang ist ein Log-Eintrag.

## 6. Glossar

| Begriff | Bedeutung |
|---|---|
| Stufe | eine der sechs Playbook-Phasen: Plan, Design, Build, Test, Deploy, Maintain |
| Artefakt | das Ergebnis einer Stufe als Markdown-Datei im Ziel-Repo (`intent.md`, `spec.md`, `plan.md`) |
| Intent | geprüfte, strukturierte Fassung des rohen Tickets: Problem, Ziel, Betroffene, offene Punkte |
| Spec | Anforderungen für die Umsetzung: User Story, Akzeptanzkriterien, betroffene Dateien, Risiken |
| Gate | Freigabe durch einen Menschen — meist der Merge des PR einer Stufe |
| Zustand | die aktuelle Stufe eines Tickets in der App-Datenbank |
| Log | persistente Einträge pro Ticket: Läufe, Rückfragen, Freigaben, Übergänge |
| Port | Schnittstelle, die der Kern braucht (z. B. `AgentRunner`) |
| Adapter | Umsetzung eines Ports für ein konkretes System (z. B. Claude CLI, SQLite, Git) |
