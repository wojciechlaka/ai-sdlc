# Doku-Neuausrichtung am AI-Native SDLC Playbook – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap, Entscheidungslog und Architektur beschreiben nur noch die lokale App heute und das Arbeitsmodell nach dem AI-Native SDLC Playbook; alte Entscheidungen, Phasen und Backlogs entfallen.

**Architecture:** Reine Doku-Änderung. Drei Dateien werden komplett neu geschrieben (`feature-roadmap.md`, `decisions.md`, `architecture.md`), drei angepasst (`datenmodell.md`, `architecture-annotated.html`, `examples/tickets/README.md`) plus Verweise in `README.md`/`CLAUDE.md`; `tickets/` wird gelöscht. Skizzen ASCII mit bündigen Rahmen. Spec: `docs/superpowers/specs/2026-10-28-playbook-docs-design.md`.

**Tech Stack:** Markdown, ASCII-Skizzen, puppeteer-core + lokales Google Chrome für das PNG.

**Branch:** `feature/nextjs-hexagonal`. Befehle im Repo-Root `ai-sdlc/`.

**Quelle des Playbooks:** https://claude.com/resources/articles/the-ai-native-sdlc-playbook

**Rahmen-Prüfung (für alle ASCII-Skizzen):** Nach dem Schreiben einer Datei mit Skizzen ausführen und sicherstellen, dass innerhalb jedes Kastens alle Rahmenzeilen gleich lang sind:

```bash
python3 - "$FILE" <<'EOF'
import sys, re
text = open(sys.argv[1], encoding='utf-8').read()
for i, block in enumerate(re.findall(r'```text\n(.*?)```', text, re.S), 1):
    lines = [l for l in block.split('\n') if l.strip()]
    framed = [l for l in lines if l.rstrip().endswith(('|', '+'))]
    lens = sorted({len(l.rstrip()) for l in framed})
    print(f'Skizze {i}: Rahmenzeilen-Längen {lens}')
EOF
```
Expected: pro Skizze genau **eine** Länge (bzw. bei mehreren nebeneinanderliegenden Kästen die Spalten der `|`/`+` je Kasten identisch — dann visuell prüfen).

---

### Task 1: Entscheidungslog neu (E1–E5)

**Files:**
- Rewrite: `docs/decisions.md`

- [ ] **Step 1: Datei komplett ersetzen**

`docs/decisions.md`:

```markdown
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
```

- [ ] **Step 2: Prüfen und committen**

Run: `grep -nE "^## " docs/decisions.md; grep -cE "\bD[0-9]{1,2}\b" docs/decisions.md`
Expected: genau die fünf Überschriften E1–E5; Zähler `0`.

```bash
git add docs/decisions.md
git commit -m "docs: Entscheidungslog neu (E1–E5) nach dem AI-Native SDLC Playbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Roadmap neu

**Files:**
- Rewrite: `docs/feature-roadmap.md`

- [ ] **Step 1: Datei komplett ersetzen**

`docs/feature-roadmap.md`:

````markdown
# Feature Roadmap: Agentic AI SDLC Platform

Ausrichtung: Anthropics [AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).
Grundsatzentscheidungen: [decisions.md](decisions.md) (E1–E5).

## 1. Ziel und Leitprinzipien

Die Plattform führt Arbeit durch die sechs Stufen des Playbooks — vom rohen Ticket bis zum Betrieb — mit
Agenten, die die Artefakte schreiben, und Menschen, die an definierten Gates freigeben.

1. **Real first:** eine echte, schmale End-to-End-Schleife statt Demo-Attrappen.
2. **Inhalte in Git, Zustand in der Plattform:** Artefakte sind Markdown-Dateien im Ziel-Repo; die
   Plattform kennt nur Stufe, Log und Verweise (E1).
3. **Mensch gibt frei:** jede Stufe endet an einem Gate — einem PR, den ein Mensch merged.
4. **Eine Metrik pro Stufe:** jede Stufe wird an genau einer Kennzahl gemessen.

## 2. Produktthese

Agenten schreiben Code in Stunden — der Engpass liegt bei Planung, Review und Freigabe. Teams brauchen
keine weitere Ablage, sondern einen **Control Layer**: Er führt den Zustand jedes Tickets über die Stufen,
stößt die Agenten an und macht sichtbar, wo Arbeit auf eine Freigabe wartet. Die Inhalte bleiben im Repo
des Teams.

## 3. Arbeitsmodell

```text
  Ticket (Jira o. A.; im Showcase: examples/tickets/*.md)
     |
     v
  +---------+  Merge  +---------+  Merge  +---------+  Merge  +---------+
  | intent  | ------> |  spec   | ------> |  plan   | ------> | Code-PR | --> Produktion
  +---------+         +---------+         +---------+         +---------+         |
       ^                                                                          |
       +------------------------- Befund -> neues intent <------------------------+

  je Stufe:  Branch <TICKET>/<stufe>  +  docs/work/<TICKET>/<artefakt>.md  +  PR (= Gate)
  Plattform: Stufe + Log pro Ticket in der DB; erkennt Merges ueber die Git-Host-API
```

- **Ticket-Eingang:** Jira o. Ä. liefert nur den rohen Inhalt. Kein Spiegel zurück; höchstens ein
  Statuswechsel. Branch-Namen mit Ticket-Schlüssel verknüpfen sich in Jira von selbst.
- **Gate:** Der PR einer Stufe wird von einem Menschen geprüft und gemergt; der Merge schaltet die nächste
  Stufe frei.

## 4. Die sechs Stufen

| Stufe | Artefakt | Gate (wer gibt frei) | Metrik | Status |
|---|---|---|---|---|
| **1 Plan** | `intent.md` — Problem, gewünschtes Ergebnis, Betroffene, offene Punkte | Product Owner | Zeit vom Ticket bis zum freigegebenen Intent | **Showcase** |
| **2 Design** | `spec.md` — User Story, Akzeptanzkriterien, betroffene Dateien, Risiken | Product Owner; riskante Specs zusätzlich Policy-Owner | Review-Runden bis zur Freigabe der Spec | **Showcase** |
| 3 Build | `plan.md` + Code-PR | Tech Lead bei riskanten Änderungen | Anteil PRs ohne Nacharbeit gemergt | Ausblick |
| 4 Test | Evals aus 20–50 echten Fällen; jeder Incident fügt einen hinzu | automatisch, Mensch bei Abweichung | Eval-Bestehensquote | Ausblick |
| 5 Deploy | Review des PR gegen geschriebene Policies | Mensch — nie der Agent, der den Code schrieb | policy-bezogene Review-Kommentare pro PR (Ziel: nahe null) | Ausblick |
| 6 Maintain | Befund aus Monitoring → neues `intent.md` | Product Owner | Zeit vom Alert bis zum neuen Intent | Ausblick |

**Stufe 1 — Plan.** Aus dem rohen Ticket schreibt der Agent `intent.md`: was das Problem ist, was erreicht
werden soll, wer betroffen ist, was offen ist. Der Product Owner prüft und merged.

**Stufe 2 — Design.** Aus dem freigegebenen Intent und der Codebase schreibt der Agent `spec.md` — mit
Rückfragen, wo Regeln unklar sind. Das ist das heutige Refinement, künftig als Datei im Repo.

**Stufe 3 — Build (Ausblick).** Der Agent schreibt zuerst `plan.md`, nach Freigabe den Code und öffnet einen
Code-PR. Team-Wissen liegt in `CLAUDE.md`, Skills und Hooks des Ziel-Repos.

**Stufe 4 — Test (Ausblick).** Der Agent prüft seine Arbeit selbst, bevor ein Mensch sie sieht. Evals aus
echten früheren Fällen sichern die Qualität; jeder Incident wird zu einem neuen Fall.

**Stufe 5 — Deploy (Ausblick).** Ein Agent reviewt den PR gegen die geschriebenen Policies; ein Mensch
genehmigt den Merge. Der Agent, der den Code schrieb, kann nicht selbst freigeben.

**Stufe 6 — Maintain (Ausblick).** Monitoring und Alerts lösen eine Diagnose aus; der Agent schreibt ein neues
`intent.md` — der Kreislauf beginnt von vorn.

## 5. Integrationen je Stufe

| Integration | ab Stufe | Rolle |
|---|---|---|
| Git-Host (GitHub) | 1 | Pflicht: Branches, Dateien, PRs, Merge-Status |
| Ticket-System (Jira o. Ä.) | 1 | optional: Eingang; später Statuswechsel, kein Inhalts-Spiegel |
| CI | 4 | Testläufe und Evals |
| Monitoring / Alerts | 6 | Auslöser für neue Intents |

## 6. Stand heute und nächster Schritt

**Heute:** Die lokale App verfeinert ein Ticket gegen ein Ziel-Repo — mit Rückfragen, Live-Fortschritt und
Ergebnis in der Datenbank. Ziel-Repo der Demo ist der Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app));
Beispiel-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

**Nächster Schritt:** Umbau auf Stufe 1 und 2 nach dem Arbeitsmodell — Tickets aus `examples/tickets/*.md`
einlesen, `intent.md` und `spec.md` als Dateien auf eigenen Branches mit PR, Stufe und Log pro Ticket in der
Datenbank, Übergang beim Merge.

**Später:** Betrieb im Team und im Unternehmen (gemeinsamer Zustand, Rollen) — erst wenn das Arbeitsmodell
in Stufe 1 und 2 trägt.
````

- [ ] **Step 2: Rahmen prüfen**

Run: die Rahmen-Prüfung aus dem Planskopf mit `FILE=docs/feature-roadmap.md`.
Expected: Die vier Stufen-Kästen in Skizze 1 stehen bündig (Zeilen `+---------+ …` und `| intent  | …` gleiche Spaltenpositionen der `+`/`|`). Bei Abweichung nur Leerzeichen/Rahmenzeichen anpassen.

- [ ] **Step 3: Prüfen und committen**

Run: `grep -cE "\bD[0-9]{1,2}\b|Phase ?[2-5]" docs/feature-roadmap.md`
Expected: `0`.

```bash
git add docs/feature-roadmap.md
git commit -m "docs: Roadmap nach den sechs Stufen des AI-Native SDLC Playbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Architektur neu

**Files:**
- Rewrite: `docs/architecture.md`

- [ ] **Step 1: Datei komplett ersetzen**

`docs/architecture.md`:

````markdown
# Architektur

Grundsatzentscheidungen: [decisions.md](decisions.md) · Stufen und Ausblick:
[feature-roadmap.md](feature-roadmap.md) · Datenmodell: [datenmodell.md](datenmodell.md)

## 1. Überblick

Eine lokale Next.js-App führt Tickets durch die Stufen des AI-Native SDLC Playbook. Agenten schreiben die
Artefakte, Menschen geben per PR frei. Die Inhalte liegen im Git-Repo des Teams, die App hält nur Zustand und
Log. Das Übersichtsbild: [architecture.png](architecture.png), erläutert in
[architecture-annotated.png](architecture-annotated.png).

## 2. Prinzipien

- **Eine Quelle pro Information:** Inhalte in Git, Zustand und Log in der App-Datenbank (E1).
- **Gate per PR:** Ein Mensch merged; der Merge ist der Übergang zur nächsten Stufe (E1).
- **Kern ohne Framework:** Fachlogik in `packages/core`, jeder Rand ein Adapter hinter einem Port (E2).
- **Agent als Werkzeug:** Coding-Agent als CLI hinter `AgentRunner`, austauschbar (E3).
- **Keine Secrets in der App:** Credentials bleiben beim Nutzer (E4).

## 3. Arbeitsmodell

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
                                     +-- App fragt Merge-Status ab ------------+
```

- **Stufe pro Ticket:** Plan → Design (Showcase), danach Build, Test, Deploy, Maintain (Ausblick).
- **Übergang:** Ist der PR einer Stufe gemergt, setzt die App die nächste Stufe und schreibt einen
  Log-Eintrag. Da eine lokale App keine Webhooks empfängt, fragt sie den Merge-Status über die Git-Host-API ab.
- **Ticket-Eingang:** Ein Ticket-System liefert nur den rohen Inhalt; es gibt keinen Inhalts-Spiegel zurück.

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

*Abb. 4 — Ist-Architektur ([E2](decisions.md), [E3](decisions.md)).*

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
| Gate | Freigabe durch einen Menschen — der Merge des PR einer Stufe |
| Zustand | die aktuelle Stufe eines Tickets in der App-Datenbank |
| Log | persistente Einträge pro Ticket: Läufe, Rückfragen, Freigaben, Übergänge |
| Port | Schnittstelle, die der Kern braucht (z. B. `AgentRunner`) |
| Adapter | Umsetzung eines Ports für ein konkretes System (z. B. Claude CLI, SQLite, Git) |
````

- [ ] **Step 2: Rahmen prüfen**

Run: die Rahmen-Prüfung aus dem Planskopf mit `FILE=docs/architecture.md`.
Expected: Skizze 2 (Ist-Architektur) genau eine Länge (82). Skizze 1 (Arbeitsmodell) hat drei Kästen nebeneinander: die `+`/`|`-Spalten je Kasten identisch über alle Zeilen; die Verbindungslinie unter dem Repo-Kasten endet in derselben Spalte wie das `|` am App-Kasten. Bei Abweichung nur Leerzeichen/Rahmenzeichen anpassen.

- [ ] **Step 3: Prüfen und committen**

Run: `grep -cE "\bD[0-9]{1,2}\b|Phase ?[2-5]|tickets/phase" docs/architecture.md`
Expected: `0`.

```bash
git add docs/architecture.md
git commit -m "docs: Architektur nach Playbook-Arbeitsmodell neu gefasst

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Datenmodell, Backlogs, Verweise

**Files:**
- Modify: `docs/datenmodell.md`
- Delete: `tickets/phase-2-backlog.md`, `tickets/phase-3-backlog.md`
- Modify: `examples/tickets/README.md:7`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: `datenmodell.md` kürzen und Verweise entfernen**

1. Alles ab der Zeile `## Phase-3-Erweiterungen (geteilte DB, lokale App)` bis zum Dateiende löschen, ebenso die unmittelbar davor stehende Trennlinie `---` (die Datei endet dann mit dem Abschnitt „Bewusst (noch) nicht modelliert“).
2. Zeile 3 ersetzen:
   ```markdown
   Stand: 2026-06-10. Zugehörige Entscheidungen: [D5–D8 im Entscheidungslog](decisions.md).
   ```
   durch
   ```markdown
   Stand: heutige App (vor dem Umbau auf das Playbook-Arbeitsmodell, siehe [architecture.md](architecture.md) §5).
   ```
3. Ersetzen: `Das aktuelle Refinement eines Tickets = `output` des letzten erfolgreichen Runs (D5).` → `Das aktuelle Refinement eines Tickets = `output` des letzten erfolgreichen Runs.`
4. Ersetzen: `Die menschliche Entscheidung zu einem Run (D7).` → `Die menschliche Entscheidung zu einem Run.`
5. Ersetzen: `Append-only Historie (D6).` → `Append-only Historie.`
6. Im Abschnitt „Bewusst (noch) nicht modelliert“ die drei Punkte ersetzen durch:
   ```markdown
   - **Project/Repo** — das Ziel-Repo ist Konfiguration
   - **User/Rollen** — keine Anmeldung in der lokalen App
   - **Editierte Output-Versionen** — Änderungen erfolgen künftig per PR auf das Artefakt im Repo
   ```

Run: `grep -nE "\bD[0-9]{1,2}\b|Phase" docs/datenmodell.md`
Expected: keine Treffer.

- [ ] **Step 2: Backlogs löschen**

```bash
git rm -q -r tickets
ls tickets 2>&1
```
Expected: `No such file or directory`.

- [ ] **Step 3: Verweise anpassen**

In `examples/tickets/README.md` ersetzen:
```markdown
Eine Datei pro Ticket; das Format ist zugleich die Vorlage für den Markdown-Import (T-17).
```
durch
```markdown
Eine Datei pro Ticket; die Dateien simulieren Jira-Tickets und sind die Vorlage für den Ticket-Eingang.
```

In `README.md` und `CLAUDE.md` jeweils `D19` durch `E2` ersetzen:
```bash
grep -n "D19" README.md CLAUDE.md
sed -i '' 's/D19/E2/g' README.md CLAUDE.md
grep -nE "\bD[0-9]{1,2}\b" README.md CLAUDE.md
```
Expected: erst die Treffer, danach keine.

- [ ] **Step 4: Commit**

```bash
git add -A docs/datenmodell.md tickets examples/tickets/README.md README.md CLAUDE.md
git commit -m "docs: Datenmodell bereinigt, alte Backlogs entfernt, Verweise auf E2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Annotierte Seite anpassen und neu rendern

**Files:**
- Modify: `docs/architecture-annotated.html`
- Regenerate: `docs/architecture-annotated.png`

- [ ] **Step 1: Satz ersetzen**

In `docs/architecture-annotated.html` ersetzen:
```html
In Phase 3 wird nur der Adapter getauscht (z. B. Postgres <code>LISTEN/NOTIFY</code>).
```
durch
```html
Für mehrere Prozesse würde nur der Adapter getauscht (z. B. Postgres <code>LISTEN/NOTIFY</code>).
```

Run: `grep -niE "phase ?[0-9]|\bD[0-9]{1,2}\b" docs/architecture-annotated.html`
Expected: keine Treffer.

- [ ] **Step 2: PNG rendern**

```bash
R=$(pwd)
T=$(mktemp -d)
cd "$T" && npm init -y >/dev/null && npm install --silent puppeteer-core@24 >/dev/null
cat > render.mjs <<'EOF'
import puppeteer from 'puppeteer-core'
const [html, out] = process.argv.slice(2)
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await browser.newPage()
await page.setViewport({ width: 1700, height: 800, deviceScaleFactor: 2 })
await page.goto(`file://${html}`, { waitUntil: 'networkidle0' })
const height = await page.evaluate(() => document.body.scrollHeight)
await page.setViewport({ width: 1700, height, deviceScaleFactor: 2 })
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log('done')
EOF
node render.mjs "$R/docs/architecture-annotated.html" "$R/docs/architecture-annotated.png"
cd "$R" && file docs/architecture-annotated.png
```
Expected: `done`, `PNG image data, 3400 x …`.

- [ ] **Step 3: Sichtprüfung und Commit**

PNG mit dem Read-Tool ansehen (Event-Bus-Block enthält den neuen Satz).

```bash
git add docs/architecture-annotated.html docs/architecture-annotated.png
git commit -m "docs: annotierte Seite ohne Phasenbezug, neu gerendert

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Abnahme

- [ ] **Step 1: Text-Prüfungen**

```bash
grep -rnE "\bD[0-9]{1,2}\b" docs README.md CLAUDE.md --exclude-dir=superpowers --exclude=ui-ux-concept.md
grep -rniE "phase ?[2-5]|phase-[2-5]" docs README.md CLAUDE.md --exclude-dir=superpowers --exclude=ui-ux-concept.md
ls tickets 2>&1
grep -cE "^## E[1-5] " docs/decisions.md
```
Expected: keine Treffer, keine Treffer, `No such file or directory`, `5`.

- [ ] **Step 2: Rahmen aller Skizzen**

Rahmen-Prüfung aus dem Planskopf für `docs/feature-roadmap.md`, `docs/architecture.md`, `docs/datenmodell.md`.
Expected: alle Kästen bündig.

- [ ] **Step 3: Code unverändert grün**

Run: `npm test && npm run build && npm run lint`
Expected: alles grün.

- [ ] **Step 4: Stand festhalten**

`git status --short` leer. Ergebnis an den Nutzer berichten (nicht pushen).
