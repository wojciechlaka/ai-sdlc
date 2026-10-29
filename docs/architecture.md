# Architektur

Grundsatzentscheidungen: [decisions.md](decisions.md) · Stufen und Ausblick:
[feature-roadmap.md](feature-roadmap.md) · Datenmodell: [datenmodell.md](datenmodell.md) · Oberfläche:
[ui-ux-concept.md](ui-ux-concept.md)

## 1. Überblick

Eine lokale Next.js-App führt Tickets durch die Stufen des AI-Native SDLC Playbooks. Ein Agent schreibt das
Artefakt der Stufe, die App legt es auf einem eigenen Branch im Ziel-Repo ab und öffnet einen PR; ein Mensch
gibt per Merge frei. Die Inhalte liegen in Git, die App hält nur Stufe, Zustand, Verweise und Log (§3).
**Stufe 1 (Plan → `intent.md`) läuft Ende zu Ende; Stufe 2 (Design → `spec.md`) ist modelliert, aber noch
nicht startbar** (§6). Das Übersichtsbild: [architecture.png](architecture.png), erläutert in
[architecture-annotated.png](architecture-annotated.png).

## 2. Prinzipien

- **Eine Quelle pro Information:** Inhalte in Git, Zustand und Log in der App-Datenbank (E1).
- **Gate per PR:** Ein Mensch merged; der Merge ist der Übergang zur nächsten Stufe (E1).
- **Kern ohne Framework:** Fachlogik in `packages/core`, jeder Rand ein Adapter hinter einem Port (E2).
- **Geprüfte Abhängigkeiten:** Architekturtests (ArchUnitTS, `architecture.test.ts` je Workspace) sichern die
  Schichten des Hexagons, die Unabhängigkeit der Adapter, Zyklenfreiheit und `web → core → shared` bei jedem `npm test`.
- **Agent als Werkzeug:** Coding-Agent als CLI hinter `AgentRunner`, austauschbar (E3).
- **Keine Secrets in der App:** Credentials bleiben beim Nutzer (E4).

## 3. Arbeitsmodell

```text
  Ticket-Eingang           App (SQLite)                    Ziel-Repo (GitHub)
  +---------------+        +------------------+            +---------------------------------+
  | examples/     | Import | Ticket CB-3      | Branch,    | Branch CB-3/intent              |
  | tickets/*.md  |------->|   Stufe/Zustand  | Datei, PR  |   docs/work/CB-3/intent.md      |
  | (= Jira)      |        |   PR-Verweis     | ---------> |   PR --(Merge)--> showcase      |
  +---------------+        |   Log            |            | Branch CB-3/spec (Stufe 2)      |
                           +------------------+ <--------- |   docs/work/CB-3/spec.md        |
                                                PR-Status, |   PR --(Merge)--> showcase      |
                                                Inhalte    |                                 |
                                                           | showcase <-Reset- showcase-base |
                                                           | master: unberuehrt              |
                                                           +---------------------------------+
```

- **Stufe pro Ticket:** Plan → Design → Fertig (Showcase), danach Build, Test, Deploy, Maintain (Ausblick).
- **Agent und App:** Der Agent liest Ticket und Klon des Ziel-Repos und liefert eine Rückfrage oder das
  Ergebnis; die App rendert daraus die Datei, legt Branch und PR an und führt den Zustand.
- **Arbeitsbranch `showcase`:** PRs gehen gegen `showcase`, Stufen und Inhalte werden von dort gelesen.
  `master` bleibt unberührt. Der Tag `showcase-base` markiert den Ausgangsstand; der Reset setzt `showcase`
  per Force darauf zurück.
- **Übergang:** Ist der PR einer Stufe gemergt, setzt die App die nächste Stufe und schreibt einen
  Log-Eintrag. Eine lokale App empfängt keine Webhooks; sie fragt den PR-Status alle 60 Sekunden und beim
  Öffnen der Ticketseite über die GitHub-API ab.
- **Ticket-Eingang:** `examples/tickets/*.md` simuliert Jira und liefert nur den rohen Inhalt; einen
  Inhalts-Spiegel zurück gibt es nicht.

## 4. Ist-Architektur

Alles auf einer Maschine, **ein** Prozess (E2); nach außen spricht nur der GitHub-Adapter.

```text
  +=============================== eine Maschine ================================+
  |  Browser                                                                     |
  |    | RSC-Seiten (lesen)   Server Actions (schreiben)   EventSource (SSE)     |
  |    v                                                                         |
  |  apps/web  --  Next.js 16, ein Node-Prozess (next dev / next start)          |
  |    lib/container.ts = Composition Root (Engine-Singleton auf globalThis)     |
  |    instrumentation.ts = Start der App + PR-Abgleich alle 60 s                |
  |    |                                                                         |
  |    v                                                                         |
  |  packages/core  --  Hexagon                                                  |
  |    application (Use Cases)  -->  domain (Regeln, Namen, Markdown)            |
  |    ports:    TicketRepository . AgentRunRepository . ArtifactRepository      |
  |              AuditLog . TicketSource . CodeHost . AgentRunner                |
  |              RepoProvider . EventPublisher                                   |
  |    adapters: sqlite (Drizzle) . markdownTickets . github (Octokit)           |
  |              git (Repo-Cache) . claudeCli . agentSandbox . nodeEvents        |
  |    |           |                |            |                  |            |
  |    v           v                v            v                  |            |
  |  SQLite   examples/tickets   Repo-Klon   "claude --print"       |            |
  |                                          in der Sandbox:        |            |
  |                                          hooks/guard.mjs (vor)  |            |
  |                                          hooks/audit.mjs (nach) |            |
  |  Secrets: lokal (Claude-Login, GITHUB_TOKEN)                    |            |
  +=================================================================|============+
                                                                    v
                                                 GitHub API (Ziel-Repo, Branch showcase)
```

*Abb. 1 — Ist-Architektur ([E2](decisions.md), [E3](decisions.md), [E6](decisions.md)). Jeder `claude`-Prozess läuft
in der Sandbox aus `adapters/agentSandbox`; Guard und Audit sind die Hook-Skripte in `packages/core/hooks/`.*

**Schichten.** `apps/web` ist der treibende Adapter: Server Components rufen Use Cases direkt auf, Server
Actions schreiben, `app/api/events/route.ts` streamt Ereignisse. `packages/core` enthält die Fachlogik;
`domain/`, `ports/` und `application/` importieren weder Adapter noch I/O — das prüft eine ESLint-Regel.
`packages/shared` hält die Zod-Verträge (DTOs, Inputs, Events, Agent-Ausgabe), die Kern und UI teilen.

**Ports nach außen.** `TicketSource` liest die Tickets (`markdownTickets`), `CodeHost` spricht mit GitHub
(`github`, Octokit, 15 s Timeout): Branch, Datei, PR, PR-Status, Dateien auf `showcase`, Tag und Reset.
`ArtifactRepository` hält die Verweise auf Branch und PR (`sqlite`). Der Klon für den Agent (`git`) kommt ohne
Token aus; geschrieben wird nur über `CodeHost` mit `GITHUB_TOKEN`.

**Fluss „Plan starten“.**

1. Server Action `startStageAction` → Use Case `startStage`: prüft Zustand und Token, setzt `running`, legt den
   AgentRun an und übergibt den Lauf an den Hintergrund.
2. Klon des Ziel-Repos aktualisieren → Codebase-Summary → `claude --print` mit dem Skill der Stufe
   (`skills/intent-agent.md`), Ausgabe per Zod geprüft, ein Wiederholungsversuch.
3. **Rückfrage** → `awaiting_answer`; die Antwort (`answerQuestion`) startet einen neuen Lauf mit dem
   Q&A-Verlauf.
4. **Intent** → `renderIntent` (Markdown) → `publishArtifact`: alten Branch löschen, Branch `CB-3/intent`
   anlegen, `docs/work/CB-3/intent.md` committen, PR `CB-3: Intent` gegen `showcase` öffnen → `in_review`.
5. `syncReviews` (Timer, Ticketseite) liest den PR: gemergt → nächste Stufe, `ready`; geschlossen → Branch
   löschen, `ready`.
6. Jeder Schritt meldet `progress`-, `state`- und `question`-Events über den `EventPublisher` an die SSE-Route;
   der Browser zeigt den Fortschritt und lädt bei Zustand oder Rückfrage die Seite neu.

**Leitplanken für den Agent.** Dass der Agent im Klon nur liest, setzen Hooks von Claude Code durch, nicht nur der
Prompt. Jeder `claude`-Prozess (Agent und Codebase-Summary) läuft in einer Sandbox (`adapters/agentSandbox`, einmal
in `compose.ts` gebaut): nur Nutzer-Einstellungen (`--setting-sources user`, nichts aus `.claude/` des fremden
Klons), Umgebung aus einer Positivliste (kein `GITHUB_TOKEN`), ein `PreToolUse`-Hook (`packages/core/hooks/guard.mjs`)
und ein `PostToolUse`-Hook (`hooks/audit.mjs`). Der Guard lässt `Read`/`Glob`/`Grep` nur innerhalb des Klons zu und
`Bash` nur für wenige lesende git-Befehle ohne Sonderzeichen; im Zweifel lehnt er ab. Beide Hooks schreiben
JSON-Zeilen in eine Datei pro Versuch, die der Claude-CLI-Adapter während des Laufs mitliest und als `ToolEvent` über
`AgentRunner.run(input, { onProgress, onToolEvent })` meldet; der Kern schreibt daraus `guard_blocked`/`tool_used` ins
Log, solange der Versuch aktuell ist. Der Agent schreibt nie in die DB — Zustände ändern nur die Use Cases. Wie Skill,
Hook und Eval zusammenspielen: §5.

Jeder Hintergrundschritt prüft, ob sein Lauf noch der aktuelle ist. Stop, Neustart und Reset lassen so keinen
veralteten Lauf Zustand schreiben; ein PR aus einem veralteten Lauf wird wieder geschlossen.

**Start und Reset.** Beim Start (`startup`) endet ein abgebrochener Lauf als `failed`, die Tickets werden
eingelesen, Tag und `showcase` bei Bedarf angelegt, verpasste Merges nachgezogen, offene PRs der App
geschlossen und die Stufe aus den Dateien auf `showcase` abgeleitet. Der **Reset** leert vorher die Datenbank
und setzt zusätzlich das Repo zurück (Branches `<TICKET>/intent|spec` löschen, `showcase` auf
`showcase-base`); ein Neustart tut das nur mit `RESET_ON_START=true`. GitHub-Fehler werden als Warnung
gemeldet, die App läuft mit dem Stand der Datenbank weiter.

**Grenzen.** Ein dauerhafter Node-Prozess ist Voraussetzung: lang laufende Kindprozesse, Event-Bus im
Speicher, lokale SQLite-Datei, Abgleich-Timer — **kein Serverless-Hosting** (E2). Die Zustandsmaschine des
Tickets steht in [datenmodell.md](datenmodell.md).

**Beispiel-Ziel.** Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)),
Beispiel-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

## 5. Governance als Code

Das Playbook verlangt, dass Regeln für den Agent nicht nur im Prompt stehen, sondern geprüft und durchgesetzt
werden. Für Stufe 1 gibt es dafür drei Bausteine, jeder als Code im Repo ([E6](decisions.md)):

| Baustein | Was er tut | Wo |
|---|---|---|
| **Skill** | sagt dem Agent, was er tun soll: Intent schreiben oder zurückfragen, nur lesen | `packages/core/skills/intent-agent.md` |
| **Hook** | setzt durch, was er darf: Guard vor jedem Werkzeugaufruf (lesen nur im Klon, Bash nur lesende git-Befehle), Audit danach; beides landet im Log des Tickets | `packages/core/hooks/` (Regel: `guardPolicy.mjs`), Sandbox: `src/adapters/agentSandbox/` |
| **Eval** | prüft mit einem echten `claude` (Haiku), dass der Guard greift: `rm -rf`, Lesen außerhalb und `curl` blockiert, `git log` und Lesen im Repo erlaubt | `packages/core/evals/guard.eval.ts`, `npm run eval:guard` |

Die Regel selbst ist zusätzlich mit Tabellentests abgedeckt (`hooks/guardPolicy.test.ts`, Teil von `npm test`);
der Eval prüft das Zusammenspiel mit Claude Code, kostet etwa 5 Cent und läuft deshalb nur auf Aufruf.

### Agent-Sandbox

Die Sandbox legt fest, **wie** ein `claude`-Prozess der App läuft: welche Einstellungen er lädt, welche Hooks
seine Werkzeuge bewachen, welche Werkzeuge er überhaupt hat und welche Umgebung er sieht. Sie ist ein Port
(`ports/claudeProcessSandbox.ts`) mit der Umsetzung `adapters/agentSandbox/agentSandbox.ts`.

| Teil | Wert heute | Zweck |
|---|---|---|
| `--setting-sources user` | nur Nutzer-Einstellungen | Einstellungen und Hooks aus `.claude/` des fremden Klons werden nie geladen |
| `--settings <JSON>` | `PreToolUse` → `hooks/guard.mjs`, `PostToolUse` → `hooks/audit.mjs` | Guard und Audit für **diesen** Prozess |
| `--allowedTools` | `Read,Glob,Grep,Bash` | nur Werkzeuge zum Lesen |
| Umgebung | Positivliste (`PATH`, `HOME`, Claude-Login, Proxy …) + `REFINEMENT_HOOK_LOG` + git ohne globale Konfiguration | keine Secrets der App (`GITHUB_TOKEN`) im Agent |
| Log-Datei | eine pro Prozess (`createLogFile()`) | Rückweg der Hook-Ereignisse ins Ticket-Log |

**Wie die Settings registriert werden.** Es gibt keine dauerhafte Registrierung — weder in `~/.claude` noch im
Ziel-Repo. Die App gibt die Hooks bei **jedem Start** eines `claude`-Prozesses als Argument mit; mit dem Ende des
Prozesses sind sie wieder weg:

```text
compose.ts            createAgentSandbox({ hooksDir })               einmal pro App-Prozess
   |                    -> args: --setting-sources user
   |                             --settings {"hooks":{PreToolUse: guard.mjs, PostToolUse: audit.mjs}}
   |                             --allowedTools Read,Glob,Grep,Bash
   |
   +-- claudeCli       (Agent einer Stufe)          \
   +-- git             (Codebase-Summary)            >  dieselbe Sandbox
   +-- evals           (Guard-Eval)                 /
          |
          v
spawn('claude', sandbox.claudeArgs(model), { cwd: Klon, env: sandbox.env(logFile) })
          |
          v
claude CLI            liest --settings beim Start, führt sie mit den Nutzer-Einstellungen zusammen
          |
          v
pro Werkzeugaufruf    /bin/sh -c "node guard.mjs || exit 2"   vorher  (ablehnen oder erlauben)
                      /bin/sh -c "node audit.mjs"             nachher (festhalten)
```

Daraus folgt: Kein `claude`-Prozess der App startet ohne Guard, denn alle Adapter starten nur über
`sandbox.claudeArgs()`. Ruft jemand `claude` selbst im Terminal auf, laufen diese Hooks nicht mit.

**Eine Sandbox oder eine pro Stufe.** Heute gibt es genau **eine** Sandbox, denn Plan und Design sollen beide nur
lesen. Pro Prozess neu ist nur die Log-Datei. Ab Stufe 3 (Build) schreibt der Agent Code; dann bekommt jede Stufe
ihre eigene Sandbox — gleiche Mechanik, andere Werte:

| | Plan / Design (heute) | Build (Ausblick) |
|---|---|---|
| Werkzeuge | `Read,Glob,Grep,Bash` | zusätzlich `Write,Edit` |
| Guard-Regel | lesen nur im Klon, Bash nur lesende git-Befehle | schreiben nur im Arbeitszweig des Tickets, freigegebene Befehle wie `npm test` und `npm run lint`, kein Netz, kein `git push` |
| Eval | „blockt Schreiben und Lesen außerhalb“ | „schreibt nur erlaubte Pfade, pusht nie“ |

Umsetzung dann: `createAgentSandbox({ hooksDir, policy })` gibt die Regel per Umgebung an den Guard
(`REFINEMENT_GUARD_POLICY`), `compose.ts` baut eine Sandbox je Stufe, und `STAGE_AGENTS` im Claude-CLI-Adapter
ordnet jeder Stufe Skill, Ausgabeschema **und** Sandbox zu. Hooks, Log-Datei, Fail-Closed und der Weg ins
Ticket-Log bleiben gleich.

**Restrisiken.** Ein Hook, der in sein Zeitlimit läuft, blockiert nicht; das Bash-Werkzeug nutzt die Shell des
Nutzers samt Startdateien; was der Agent im öffentlichen Klon liest, sieht er ganz. Details:
[Spec §13](superpowers/specs/2026-10-28-playbook-stages-design.md#13-nachtrag-guard--und-audit-hooks-für-den-agent).

## 6. Stand und nächster Schritt

**Gebaut (Stufe 1):**

- Tickets aus `examples/tickets/*.md`, Schlüssel wie `CB-3` als Primärschlüssel.
- Intent-Agent mit Rückfragen; `intent.md` auf eigenem Branch mit PR gegen `showcase`.
- Merge-Erkennung per Abfrage (Timer und Ticketseite), Übergang in Stufe 2, Inhalt live von `showcase`.
- Log pro Ticket mit Läufen, Rückfragen, PRs, Übergängen, Kosten und Tokens.
- Aufräumen beim Start, Showcase-Reset (Tag `showcase-base`, Reset-Button, `RESET_ON_START`).
- Leitplanken des Agents: Sandbox, Guard- und Audit-Hooks, Eval (§5).

**Offen:**

- **Stufe 2 (Design):** Spec-Agent, der aus dem gemergten `intent.md` und der Codebase `spec.md` schreibt;
  dazu Skill, Ausgabeschema und `design` in `STARTABLE_STAGES`.
- **Klon auf `showcase`:** Der Agent liest heute den Klon des Default-Branches; für Stufe 2 muss er den Stand
  von `showcase` sehen (dort liegt das gemergte `intent.md`).
- **Sandbox pro Stufe:** spätestens mit Stufe 3 (Build), siehe §5 „Agent-Sandbox“.

## 7. Glossar

| Begriff | Bedeutung |
|---|---|
| Stufe | Playbook-Phase eines Tickets; in der App `plan` (1 Plan), `design` (2 Design), `done` (Fertig) |
| Zustand | wo ein Ticket innerhalb seiner Stufe steht: `ready`, `running`, `awaiting_answer`, `in_review`, `failed` |
| Artefakt | das Ergebnis einer Stufe als Markdown-Datei im Ziel-Repo (`intent.md`, `spec.md`) |
| Intent | geprüfte, strukturierte Fassung des rohen Tickets: Problem, Ziel, Erfolgskriterien, Betroffene, offene Punkte |
| Spec | Anforderungen für die Umsetzung: User Story, Akzeptanzkriterien, betroffene Dateien, Risiken |
| Branch | pro Ticket und Stufe `<TICKET>/intent` bzw. `<TICKET>/spec`, PR gegen `showcase` |
| `showcase` | Arbeitsbranch der App im Ziel-Repo; Tag `showcase-base` ist sein Ausgangsstand |
| Gate | Freigabe durch einen Menschen — der Merge des PR einer Stufe |
| Log | persistente Einträge pro Ticket: Läufe, Rückfragen, PRs, Übergänge, Fehler |
| Port | Schnittstelle, die der Kern braucht (z. B. `CodeHost`, `AgentRunner`) |
| Adapter | Umsetzung eines Ports für ein konkretes System (z. B. GitHub, Claude CLI, SQLite) |
