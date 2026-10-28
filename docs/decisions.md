# Entscheidungslog

Grundsatzentscheidungen der Plattform. Ausrichtung: Anthropics
[AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).

## E1 — Arbeitsmodell nach dem AI-Native SDLC Playbook (2026-10-28)

**Entscheidung.** Arbeit durchläuft die sechs Stufen des Playbooks — Plan, Design, Build, Test, Deploy,
Maintain. Jede Stufe erzeugt ein Artefakt, das Mensch und Agent lesen und das die nächste Stufe speist:
`intent.md` → `spec.md` → `plan.md` → Code-PR → Produktion → (Befund) neues `intent.md`.

- **Inhalte liegen in Git**, pro Ticket im Ziel-Repo (z. B. `docs/work/CB-3/intent.md`).
- **Pro Stufe ein Branch** `<TICKET>/<stufe>` (z. B. `CB-3/intent`) und **ein PR als Gate**; der **Merge ist
  der Übergang** in die nächste Stufe.
- **Die Plattform hält nur Zustand und Log**: aktuelle Stufe pro Ticket und ein persistentes Log (Läufe,
  Rückfragen, Freigaben, Übergänge, Zeitstempel). Merges erkennt sie durch Abfrage der Git-Host-API.
- **Ticket-Systeme wie Jira sind nur Eingang** für den rohen Ticket-Inhalt. Es gibt keinen Spiegel von
  Inhalten zurück; höchstens ein Statuswechsel. Branch-Namen mit Ticket-Schlüssel verknüpfen sich über die
  Git-Integration von Jira von selbst.
- **Showcase:** Stufe 1 (Plan → `intent.md`) und Stufe 2 (Design → `spec.md`). Markdown-Dateien in
  `examples/tickets/` simulieren die Jira-Tickets.

**Begründung.** Wenn Agenten Code in Stunden schreiben, liegt der Engpass bei Planung, Review und
Freigabe. Diese Schritte brauchen nachvollziehbare Artefakte und klare Gates. Git liefert Versionen,
Review und Freigabe bereits mit; jede Information hat genau eine Quelle.

**Trade-offs.** Die Plattform braucht Schreibrechte auf das Ziel-Repo (Branch, Datei, PR). Ohne Webhooks
(lokale App) werden Übergänge per Abfrage erkannt, also mit Verzögerung.

## E2 — Eine Next.js-App, Fachkern nach Ports & Adapters (2026-10-28)

**Entscheidung.** Die Plattform ist **eine Next.js-App** (App Router) und läuft als **ein Prozess**: Server
Components lesen, Server Actions schreiben, ein Route Handler streamt Live-Ereignisse per SSE. Die Fachlogik
liegt in `packages/core` nach **Ports & Adapters** (Domäne, Use Cases, Ports; Adapter für SQLite/Drizzle,
Git, Claude CLI und einen Event-Bus im Prozess). `packages/shared` hält die Zod-Verträge zwischen Kern und UI.

**Begründung.** Ein Prozess und ein Start-Befehl halten die lokale App einfach. Die Fachlogik ist schmal,
die Ränder wachsen mit den Playbook-Stufen (Git-Host, später Jira, CI, Monitoring) — jeder Rand ist ein
Adapter hinter einem Port, der Kern bleibt unberührt. Eine ESLint-Regel erzwingt die Abhängigkeitsrichtung.

**Trade-offs.** **Kein Serverless-Hosting:** Agent-Läufe sind lang laufende Kindprozesse, der Event-Bus lebt
im Speicher, die Datenbank ist eine lokale Datei. Die Engine ist ein Singleton auf `globalThis`, weil Next.js
Module in mehreren Bundles lädt; Fachfehler werden über ein `code`-Feld statt `instanceof` erkannt.

## E3 — Coding-Agent als CLI hinter einem Port (2026-10-28)

**Entscheidung.** Es gibt keinen eigenen Agent-Orchestrator. Ein Coding-Agent wird headless als CLI
(`claude --print`, JSON-Stream) aufgerufen — hinter dem Port `AgentRunner`.

**Begründung.** Die Agent-Schleife (Werkzeuge, Kontext, Wiederholungen) nicht nachbauen. Der Port hält den
Austausch lokal: das Claude Agent SDK wird später ein weiterer Adapter, ohne Änderung am Kern.

**Trade-offs.** Abhängigkeit von CLI-Ausgabeformaten; Validierung der Ausgabe per Zod mit einem
automatischen Wiederholungsversuch.

## E4 — Credentials bleiben beim Nutzer (2026-10-28)

**Entscheidung.** Claude-Login und Git-Host-Token liegen lokal beim Nutzer. Die Plattform speichert keine
Secrets; der Agent handelt im Namen des Nutzers.

**Begründung.** Kein Secret-Management in der Plattform; Rechte und Kosten bleiben dort, wo sie entstehen.

**Trade-offs.** Jede Installation braucht eigenen Claude-Zugang und ein Token mit Schreibrecht auf das
Ziel-Repo.

## E5 — ASCII-Skizzen in der Markdown-Doku (2026-10-28)

**Entscheidung.** Skizzen in Markdown-Dokumenten sind ASCII in ` ```text `-Blöcken mit bündigen Rahmen.
Gerenderte Bilder gibt es nur für die Übersichtsseite (`docs/architecture.png`,
`docs/architecture-annotated.png`).

**Begründung.** Eine editorunabhängige Notation ohne Toolchain; Diffs bleiben lesbar.
