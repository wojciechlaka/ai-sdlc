# Entscheidungslog

Grundsatzentscheidungen der Plattform. Ausrichtung: Anthropics
[AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).

## E1 — Arbeitsmodell nach dem AI-Native SDLC Playbook (2026-10-28)

**Entscheidung.** Arbeit durchläuft die sechs Stufen des Playbooks — Plan, Design, Build, Test, Deploy,
Maintain. Jede Stufe erzeugt ein Artefakt, das Mensch und Agent lesen und das die nächste Stufe speist:
`intent.md` → `spec.md` → `plan.md` → Code-PR → Produktion → (Befund) neues `intent.md`.

- **Inhalte liegen in Git**, pro Ticket im Ziel-Repo (z. B. `docs/work/CB-3/intent.md`).
- **Pro Stufe ein Branch** nach dem Artefakt benannt, `<TICKET>/intent|spec` (z. B. `CB-3/intent`), und **ein PR
  als Gate**; der **Merge ist der Übergang** in die nächste Stufe.
- **Arbeitsbranch `showcase`:** PRs gehen gegen `showcase`, Stufen und Inhalte werden von dort gelesen;
  `master` bleibt unberührt. Ein Reset setzt `showcase` auf den Tag `showcase-base` zurück.
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
GitHub (Octokit), die Markdown-Ticketquelle, den Git-Klon, Claude CLI und einen Event-Bus im Prozess).
`packages/shared` hält die Zod-Verträge zwischen Kern und UI.

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

## E6 — Leitplanken des Agents als Code (Hook + Sandbox + Eval), kein MCP für Schreibzugriffe (2026-10-28)

**Entscheidung.** Was der Agent darf, steht nicht nur im Skill, sondern wird als Code durchgesetzt und geprüft:

- **Sandbox** für jeden `claude`-Prozess (`adapters/agentSandbox`): nur Nutzer-Einstellungen (nichts aus `.claude/`
  des fremden Klons), nur lesende Werkzeuge, Umgebung aus einer Positivliste ohne `GITHUB_TOKEN`.
- **Hooks** von Claude Code (`packages/core/hooks/`): der Guard (`PreToolUse`) lässt Lesen nur im Klon und Bash nur
  für lesende git-Befehle zu und scheitert geschlossen; das Audit (`PostToolUse`) hält jeden Aufruf fest. Beides
  landet als `guard_blocked`/`tool_used` im Log des Tickets.
- **Eval** (`packages/core/evals/guard.eval.ts`, `npm run eval:guard`): ein echter Agent versucht verbotene und
  erlaubte Aufrufe; geprüft wird das Hook-Log.
- **Kein MCP-Server, über den der Agent in die DB schreibt.** Zustände ändern nur die Use Cases nach den Regeln
  der Domäne; der Agent liefert Rückfrage oder Ergebnis, die App handelt.

Die Regel für Bash war zuerst eine Positivliste lesender Shell-Befehle (`cat`, `ls`, `grep`, …). Nach einem Review
mit einer Reihe von Umgehungen (Verkettung, Umleitung, Ersetzung, `sort -o`, `git grep -O`, …) wurde sie zu einer
**minimalen git-Grammatik** gehärtet: nur `git log|show|diff|blame|ls-files|status|rev-parse` mit erlaubten Optionen,
ohne Shell-Sonderzeichen; zum Lesen sind `Read`, `Glob` und `Grep` da. Jede bekannte Umgehung steht als
Ablehnung in den Tabellentests.

**Begründung.** Ein Prompt ist eine Bitte, kein Schutz — das Playbook fordert „Governance als Code“. Der Hook sitzt
dort, wo das Risiko liegt: an den Werkzeugen des Agents. Eine Positivliste ohne Shell-Parser ist klein genug, um
sie vollständig zu testen. Ein Schreibzugang über MCP würde die Zustandsmaschine umgehen und den Agent zum
zweiten Schreiber der DB machen. Der Eval zeigt, dass die Regel mit dem echten Claude Code zusammenspielt, was
Unit-Tests allein nicht belegen.

**Trade-offs.** Der Agent kann weniger: keine beliebigen Shell-Befehle, keine Bereiche `a..b` in git. Die Hooks
hängen am Hook-Format von Claude Code. Restrisiken bleiben (Zeitlimit eines Hooks, Startdateien der Nutzer-Shell,
siehe [Spec §13](superpowers/specs/2026-10-28-playbook-stages-design.md#13-nachtrag-guard--und-audit-hooks-für-den-agent)).
Der Eval kostet Geld (etwa 5 Cent mit Haiku) und hängt vom Verhalten des Modells ab; er läuft daher nur auf Aufruf,
nicht in `npm test`.
