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
  (später `<TICKET>/spec`), PR gegen den Branch `showcase` (siehe [Showcase-Branch und Repo-Reset](#showcase-branch-und-repo-reset)).

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
   - **Contents:** Read and write (Branch anlegen, Datei committen, Branch löschen, Tag anlegen, `showcase` zurücksetzen)
   - **Pull requests:** Read and write (PR öffnen, Status lesen, PR schließen)
   - **Metadata:** Read-only (setzt GitHub automatisch)
6. **Generate token** und den Wert (`github_pat_…`) kopieren — GitHub zeigt ihn nur einmal.

### 3. `apps/web/.env.local`

```bash
GITHUB_TOKEN=github_pat_...
TARGET_REPO=https://github.com/<dein-konto>/node-express-realworld-example-app
```

Die Datei ist in Git ignoriert. Nach einer Änderung die App neu starten.

## Showcase-Branch und Repo-Reset

Für Vorführungen lässt sich das Ziel-Repo auf seinen Ausgangsstand zurücksetzen, ohne dass sich die Historie von
`master` ändert:

- **Arbeitsbranch `showcase`:** PRs der App gehen gegen `showcase`; Inhalte und Stufen werden von dort gelesen,
  Links in der App zeigen auf `blob/showcase/…`. **`master` bleibt unberührt.**
- **Ausgangsstand = Tag `showcase-base`.** Beim Start (mit Token) legt die App fehlende Teile selbst an: fehlt der
  Tag, kommt er auf den aktuellen Stand des Default-Branches; fehlt `showcase`, kommt der Branch auf den Tag.
  Im Repo ist nichts vorzubereiten. Soll der Ausgangsstand wandern, den Tag von Hand verschieben.
- **Repo-Reset:** offene PRs der App schließen, alle Branches `<TICKET>/intent|spec` bekannter Tickets löschen
  (auch Reste gemergter PRs), dann `showcase` per Force auf `showcase-base` setzen. Danach stehen alle Tickets in
  Stufe 1 Plan.
- **Auslöser:** der **Reset**-Button immer; ein Neustart nur mit `RESET_ON_START=true` in `apps/web/.env.local`.
  Ohne die Variable lässt ein Neustart `showcase` in Ruhe — praktisch beim Entwickeln.
- **Rechte:** das Token braucht keine weiteren Rechte (Contents: Read and write deckt Tag und Force-Update ab).
  **Ein Branch-Schutz auf `showcase` verhindert den Reset;** die App läuft dann mit dem bisherigen Stand weiter
  und zeigt die Meldung unter dem Reset-Button. Das gilt ebenso für Rulesets auf `showcase` oder auf Tags
  `showcase*` — sie blockieren den Reset bzw. das Anlegen des Tags.
- **Während des Resets** lehnt die App das Starten einer Stufe und Antworten ab („Repo wird gerade zurückgesetzt“).

## Verhalten beim Start

Bei jedem Start (und beim **Reset**-Button, der vorher die Datenbank leert):

1. **Tickets einlesen:** jede Datei `examples/tickets/*.md` wird ein Ticket (siehe
   [`examples/tickets/README.md`](examples/tickets/README.md)). Geänderter Text wird übernommen, Stufe und Zustand bleiben.
2. **Showcase vorbereiten:** Tag `showcase-base` und Branch `showcase` anlegen, falls sie fehlen.
3. **Merges nachziehen:** PRs, die gemergt wurden, während die App aus war, schieben ihr Ticket weiter.
   Das gilt auch vor einem Repo-Reset, damit kein Artefakt als offen stehen bleibt.
4. **Aufräumen:** **alle offenen PRs der App werden geschlossen und ihre Branches gelöscht** — erkannt am
   Branch-Namen `<TICKET>/intent` bzw. `<TICKET>/spec` eines bekannten Tickets. PRs anderer Branches bleiben
   unberührt. GitHub kann PRs nicht löschen; geschlossene PRs bleiben in der Historie des Repos.
5. **Repo-Reset** (nur Reset-Button oder `RESET_ON_START=true`): siehe oben.
6. **Stufe ableiten:** liegt `docs/work/<TICKET>/spec.md` auf `showcase` → Fertig; liegt dort
   `intent.md` → Stufe 2 Design; sonst Stufe 1 Plan. Ohne Repo-Reset bleiben gemergte Artefakte also erhalten.

Ohne Token oder wenn GitHub nicht erreichbar ist, startet die App mit dem Stand der Datenbank und schreibt eine
Warnung ins Server-Log; beim Reset-Button erscheinen die Warnungen zusätzlich unter dem Button.
Jede GitHub-Anfrage bricht nach 15 Sekunden ab. Fehlt der Ordner `examples/tickets`, startet die App nicht
(Meldung `[startup] App konnte nicht starten` im Server-Log). Der **Reset**-Button fragt vorher nach, weil er die
Datenbank leert, offene PRs der App schließt und `showcase` zurücksetzt.

## Ablauf (Stufe 1)

1. Ticket auf dem Board öffnen (CB-2 ist der kleinste Lauf), Modell wählen, **Plan starten**.
2. Der Agent liest das Ticket und den Klon des Ziel-Repos. Bei einer blockierenden Unklarheit stellt er eine
   **Rückfrage** in der App; die Antwort fließt in den nächsten Lauf und landet unter „Geklärte Rückfragen“.
3. Die App legt `docs/work/<TICKET>/intent.md` auf dem Branch `<TICKET>/intent` an und öffnet den PR
   `<TICKET>: Intent` gegen `showcase`.
4. Auf GitHub prüfen und **mergen** — innerhalb von 60 Sekunden (sofort beim Öffnen der Ticketseite) steht das
   Ticket in Stufe 2 Design, der Inhalt des Intent ist in der App sichtbar. **Schließen ohne Merge** setzt das
   Ticket auf „bereit“ zurück und löscht den Branch.

Ein Lauf nutzt den eigenen Claude-Login und verbraucht Tokens; Kosten und Tokens stehen im Log des Tickets.

## Leitplanken für den Agent

Der Agent darf im Klon des Ziel-Repos nur **lesen** — durchgesetzt durch Hooks von Claude Code, nicht nur durch
den Prompt. Jeder `claude`-Prozess der App läuft in einer Sandbox:

- **Lesen nur im Klon:** `Read`, `Glob` und `Grep` sind erlaubt, aber nur für Pfade innerhalb des Klons (Symlinks
  werden aufgelöst; `/etc/…`, `~/.ssh/…`, `../…` werden abgelehnt).
- **Bash nur für die git-Historie:** `git log`, `show`, `diff`, `blame`, `ls-files`, `status`, `rev-parse` mit
  wenigen erlaubten Optionen (z. B. `git log --oneline -n20`, `git diff --stat HEAD~1`, `git blame -L10,40 src/app.ts`), ohne jedes
  Sonderzeichen (`$`, `;`, `|`, `>`, Anführungszeichen, …; `~` und `^` nur in Revisionen wie `HEAD~1`) und ohne Pfade außerhalb. Alles andere —
  `rm`, `cat`, `curl`, `npm`, `git push`, Umleitungen, Verkettungen — wird blockiert.
- **Alle anderen Werkzeuge** (`Write`, `Edit`, `WebFetch`, …) sind blockiert.
- **Keine Secrets im Agent:** Der Prozess sieht nur eine kleine Liste an Umgebungsvariablen (`PATH`, `HOME`,
  Claude-Login, Proxy) — kein `GITHUB_TOKEN`. Einstellungen und Hooks aus einem `.claude/`-Ordner des Ziel-Repos
  werden nicht geladen (`--setting-sources user`).
- **Im Zweifel blockiert:** Kann der Guard nicht laufen, wird der Aufruf abgelehnt.
- **Symlinks** des Ziel-Repos werden im Klon als normale Dateien ausgecheckt und führen nicht aus ihm heraus.

Restrisiken: Läuft ein Hook in sein Zeitlimit (10 s), blockiert Claude Code nicht. Das Bash-Werkzeug nutzt die
eigene Shell (`SHELL`) samt deren Startdateien — sie gehören dir und gelten als vertrauenswürdig.

Der Agent sieht die Begründung und arbeitet ohne den Aufruf weiter. Im **Log des Tickets** steht ein blockierter
Aufruf rot hervorgehoben (z. B. „Blockiert: Bash \`rm -rf docs\` — Befehl rm ist nicht erlaubt. Nur git
log/show/diff/blame/ls-files/status/rev-parse ohne Sonderzeichen erlaubt — zum Lesen Read, Glob oder Grep
verwenden“), während des Laufs auch als Fortschrittszeile. Alle ausgeführten Aufrufe eines Laufs erscheinen
zusammengefasst als „N Werkzeugaufrufe“ und lassen sich aufklappen. Bei der Codebase-Analyse (ohne Ticket)
landen blockierte Aufrufe nur im Server-Log. Regeln: `packages/core/hooks/guardPolicy.mjs`; Sandbox:
`packages/core/src/adapters/agentSandbox/agentSandbox.ts`.

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
Die vollständigen Architekturregeln (Schichten, Adapter untereinander, Zyklen, Core nur über `@refinement/core`)
prüfen Architekturtests mit ArchUnitTS als Teil von `npm test` (`architecture.test.ts` in jedem Workspace).

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
| `RESET_ON_START`        | —                                                                    | `true`: jeder Start setzt `showcase` zurück |

## Befehle

| Befehl          | Zweck                                      |
|-----------------|--------------------------------------------|
| `npm run dev`   | Entwicklungsserver (http://localhost:3000) |
| `npm run build` | Typprüfung aller Pakete + `next build`     |
| `npm start`     | gebaute App starten                        |
| `npm test`      | alle Tests (Vitest), inkl. Architekturtests |
| `npm run lint`  | Abhängigkeitsregel des Hexagons            |

Die App läuft als ein dauerhafter Node-Prozess (lang laufende Agent-Prozesse, Event-Bus im Speicher, lokale
SQLite, Abgleich-Timer). Serverless-Hosting wird nicht unterstützt (siehe [E2](docs/decisions.md)).
