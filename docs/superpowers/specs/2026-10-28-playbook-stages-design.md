# Design: App-Umbau auf Playbook-Stufen 1 + 2 (Intent → Spec in Git)

Datum: 2026-10-28 · Status: abgestimmt, bereit für Implementierungsplan · Branch: `feature/playbook-stages`
Grundlage: [E1–E5](../../decisions.md), [Roadmap](../../feature-roadmap.md), [Architektur §5](../../architecture.md)

## 1. Ziel

Die App führt Tickets durch **Stufe 1 (Plan → `intent.md`)** und **Stufe 2 (Design → `spec.md`)** des AI-Native
SDLC Playbook. Artefakte entstehen als Dateien im Ziel-Repo auf eigenen Branches mit PR; der Merge ist das
Gate. Die App hält nur Stufe, Zustand, Verweise und Log.

## 2. Annahmen und Rahmen

- **Ziel-Repo ist öffentlich** (erster Schritt). Lesen/Klonen ohne Token; **Schreiben** (Branch, Datei, PR) braucht
  trotzdem ein Token mit Schreibrecht (GitHub-Vorgabe). Private Repos sind nicht Teil dieses Umbaus.
- **Ziel-Repo:** `TARGET_REPO` in `apps/web/.env.local`, Vorgabe
  `https://github.com/wojciechlaka/node-express-realworld-example-app`. Default-Branch wird über die API gelesen
  (beim Fork: `master`).
- **Token:** `GITHUB_TOKEN` (Fine-grained PAT, nur der Fork, *Contents: Read and write*, *Pull requests: Read and
  write*). Anleitung im README.
- **Ablage:** `docs/work/<TICKET>/intent.md` und `docs/work/<TICKET>/spec.md`; Branches `<TICKET>/intent`,
  `<TICKET>/spec`; **PR gegen den Default-Branch (`master`)**.
- **Ticket-Eingang:** `examples/tickets/*.md` simulieren Jira-Tickets und sind die einzige Quelle; `seeds.ts` entfällt.

## 3. Verhalten beim Start der App

1. **Tickets übernehmen:** jede Datei `examples/tickets/*.md` wird ein Ticket (Upsert nach Schlüssel). Schlüssel
   und Titel aus `# CB-3: Titel`, Beschreibung = Text darunter, Priorität aus `**Priorität:** …`. Eine neue
   Datei erscheint nach Neustart oder Reset als neues Ticket; geänderter Text wird übernommen, Stufe/Zustand
   bleiben.
2. **Aufräumen:** alle **offenen PRs der App** (Head-Branch `<TICKET>/intent` oder `<TICKET>/spec` zu einem
   bekannten Ticket) werden **geschlossen**, ihre **Branches gelöscht**. PRs anderer Branches bleiben unberührt.
   (GitHub erlaubt kein Löschen von PRs; geschlossene PRs bleiben in der Repo-Historie.)
3. **Stufe ableiten:** liegt `docs/work/<TICKET>/spec.md` auf dem Default-Branch → `done`; sonst liegt
   `intent.md` dort → `design/ready`; sonst `plan/ready`. Laufende Agent-Läufe von vor dem Neustart werden als
   abgebrochen markiert.
4. Fehlt das Token oder ist GitHub nicht erreichbar: App startet mit DB-Stand, Warnung im Server-Log,
   erneuter Versuch beim nächsten Abgleich.

Der **Reset-Button** leert die DB und führt den Start-Ablauf aus.

## 4. Domäne und Datenmodell

```text
Ticket    key "CB-3" · title · description · priority · sourcePath
          stage: plan | design | done
          state: ready | running | awaiting_answer | in_review | failed
  1 -- n  AgentRun    stage · trigger initial|answer · input · output (Rueckfrage/Ergebnis) · status ·
                      model · Kosten/Tokens · Zeiten
  1 -- n  Artifact    stage · path · branch · prNumber · prUrl · prState open|merged|closed · mergedAt
  1 -- n  AuditEvent  Log: ticket_imported, run_started, run_finished, question_asked, answer_given,
                      pr_opened, pr_merged, pr_closed, stage_changed, cleanup
```

Übergänge (reine Funktionen in `domain/`):

```text
<stufe>/ready|failed --Start--> running
running --Rueckfrage--> awaiting_answer --Antwort--> running
running --Ergebnis (Datei + Branch + PR)--> in_review
in_review --Merge--> naechste Stufe/ready   (design --Merge--> done)
in_review --PR geschlossen--> ready  (Branch geloescht)
running --Fehler/Timeout--> failed
running|awaiting_answer --Stop--> ready
```

Entfällt: `status`, `iteration`, Tabelle `review_decisions`, Ergebnis als Inhaltsquelle in der DB. Keine
Migration bestehender Daten — die DB wird neu aufgebaut (Start-Ablauf).

## 5. Ports, Adapter, Use Cases

**Neue Ports**

| Port | Methoden | Adapter |
|---|---|---|
| `TicketSource` | `list(): {key, title, description, priority, sourcePath}[]` | `markdownTickets` (liest `examples/tickets/*.md`) |
| `CodeHost` | `defaultBranch()`, `readFile(path)` (Default-Branch, `null` wenn fehlt), `createBranch(name)` (vom Default-Branch), `commitFile(branch, path, content, message)`, `openPullRequest(branch, title, body)`, `getPullRequest(nr)`, `listOpenPullRequests()`, `closePullRequest(nr)`, `deleteBranch(name)` | `github` (Octokit REST, `GITHUB_TOKEN`, `fetch` injizierbar) |
| `ArtifactRepository` | pro Ticket + Stufe speichern/lesen/aktualisieren | `sqlite` |

Angepasst: `TicketRepository` (Schlüssel, Stufe, Zustand, Upsert), `AgentRunner` (bekommt die Stufe; Ausgabe
je Stufe), `AgentRunRepository` (Stufe). Unverändert: `RepoProvider`, `AuditLog`, `EventPublisher`.

**Use Cases**

| Use Case | Ablauf |
|---|---|
| `startup` | Abschnitt 3 |
| `startStage(key, model)` | nur `ready`/`failed` → `running` → Hintergrund: Klon aktualisieren → (Design: gemergtes `intent.md` lesen) → Agent → Rückfrage (`awaiting_answer`) oder Ergebnis → Markdown rendern → übrig gebliebenen Branch der Stufe löschen → Branch + Datei + PR → Artefakt + `in_review` |
| `answerQuestion(key, answer)` | setzt den Lauf der aktuellen Stufe mit Q&A-Verlauf fort |
| `stopRun(key)` | `running`/`awaiting_answer` → `ready` |
| `syncReviews(key?)` | für `in_review`: PR-Status lesen → gemergt: nächste Stufe; geschlossen: Branch löschen, `ready`; nicht lesbar: `ready` + Log |
| `resetSystem` | DB leeren, `startup` |
| `listTickets`, `getTicket` | inkl. Artefakte, Log, Inhalt der Artefakte **live** vom Default-Branch (keine Kopie in der DB) |

Treibende Adapter (Next.js): `instrumentation.ts` ruft `startup` und startet einen **60-Sekunden-Timer** für
`syncReviews`; die Ticketseite ruft beim Öffnen `syncReviews(key)`; Server Actions für `startStage`,
`answerQuestion`, `stopRun`, `resetSystem`. Zustandswechsel gehen per SSE an offene Tabs.

## 6. Agent, Prompts, Artefakte

- Skills: `packages/core/skills/intent-agent.md` (neu: rohes Ticket → Problem, gewünschtes Ergebnis,
  Betroffene, offene Punkte; Code nur zum Verständnis, keine Lösung) und `spec-agent.md` (aus
  `refinement-agent.md`; Eingabe: gemergtes `intent.md` + Codebase).
- Ausgabe (Zod in `packages/shared`, Prüfung + ein Retry wie heute):
  - Plan: `{type:'question', question}` | `{type:'intent', result: IntentSchema}`
  - Design: `{type:'question', question}` | `{type:'spec', result: RefinementOutputSchema}`
  - `IntentSchema = { title (≤60), problem, desiredOutcome, affected: string[], openPoints: {question}[] }`
- Blockierende Unklarheiten → Rückfrage in der App; nicht blockierende → offene Punkte in der Datei.
- Rendering als reine Funktionen `renderIntent`/`renderSpec` in `domain/`: YAML-Kopf `ticket`, `stage`,
  `source` (kein Zustand in der Datei), dann feste Abschnitte; Intent: Problem · Gewünschtes Ergebnis ·
  Betroffene · Offene Punkte · Geklärte Rückfragen; Spec: User Story · Akzeptanzkriterien · Betroffene Dateien ·
  Risiken · Offene Punkte · Geklärte Rückfragen.
- PR: Titel `CB-3: Intent` / `CB-3: Spec`; Text mit Kurzfassung, Link auf die Quelldatei, „Merge = Freigabe
  dieser Stufe“.
- Agent liest wie heute den lokalen Klon (Read, LS, Bash) mit gecachter Codebase-Summary; der Klon wird vor
  jedem Lauf aktualisiert.

## 7. UI

- **Board nach Stufen:** Spalten „1 Plan“, „2 Design“, „Fertig“. Karte: Schlüssel, Titel, Priorität, Zustand
  (bereit · Agent läuft · Rückfrage · in Review: PR #n · fehlgeschlagen); live per SSE.
- **Ticket-Detail** `/tickets/CB-3`: Ticket (Quelle, rohe md) · Stufen mit Häkchen, Datum, Links auf Datei und
  PR · Inhalt von Intent/Spec aufklappbar (live vom Default-Branch) · Log (inkl. Kosten/Tokens pro Lauf) ·
  genau **eine Aktion** je Zustand: „Plan/Design starten“ (Modell-Auswahl) · „Stoppen“ · Antwortfeld · „PR öffnen“.
- **Seitenleiste:** Repo als Anzeige mit Link (aus `TARGET_REPO`), Hinweis „Token fehlt“, Reset-Button.
- Entfällt: Repo-Eingabefeld, „Neues Ticket“, „Löschen“, „Refine“, alte Ergebnis-Box.

## 8. Fehlerbehandlung

- Ohne `GITHUB_TOKEN`: App läuft, Start-Buttons deaktiviert mit Hinweis; Abgleich beim Start entfällt (Warnung).
- GitHub-Fehler beim Start/Abgleich: weiter mit DB-Stand, Warnung, Wiederholung beim nächsten Abgleich.
- Fehler bei Branch/Datei/PR (401/403/404/422): Lauf `failed`, verständliche Meldung im Ticket, Log; erneut startbar.
- Agent-Fehler/Timeout: `failed`, erneut startbar. Stop: `ready`.

## 9. Tests

- Kern: Übergänge, `renderIntent`/`renderSpec` (exaktes Markdown), alle Use Cases mit Fakes (`FakeCodeHost`,
  `FakeTicketSource`, `FakeAgentRunner`), inkl. `startup` (Aufräumen, Stufe ableiten) und `syncReviews`.
- Adapter: `markdownTickets` mit Testdateien; `github` mit gemocktem `fetch` (keine echten API-Aufrufe).
- Web: Board nach Stufen, Stufen-Panel mit der jeweiligen Aktion, Log-Anzeige, Actions.
- Manueller Durchlauf gegen den Fork nur nach Zustimmung (Tokens, PRs im Repo).

## 10. Aufteilung

- **Teil A — Stufe 1 Ende zu Ende:** Datenmodell, `TicketSource`, `CodeHost`/`github`, `startup` inkl.
  Aufräumen, `syncReviews` + Timer, Intent-Agent + Rendering + Branch/PR, Board nach Stufen, Ticket-Detail
  (Quelle, Stufen, Log, Inhalt), Repo als Server-Konfiguration, README (Token, `TARGET_REPO`, Annahmen,
  Start-Verhalten), `examples/tickets/README.md` (neues Ticket anlegen).
- **Teil B — Stufe 2:** Spec-Agent auf gemergtem Intent, Spec-Rendering, Branch/PR, Übergang `done`; Altlasten
  entfernen (altes Refine, `output` als Ergebnisquelle, `review_decisions`, `seeds.ts`-Reste); Doku:
  `ui-ux-concept.md` neu, `datenmodell.md`,
  `architecture.md` (§5 wird Ist-Stand), `CLAUDE.md`.

## 11. Abnahme

- `npm test`, `npm run build`, `npm run lint` grün.
- Start zeigt genau die Tickets aus `examples/tickets/*.md` (CB-1 … CB-3); eine neue Datei erscheint nach Reset.
- Manueller Durchlauf (nach Zustimmung) mit CB-2: „Plan starten“ → PR `CB-2/intent` mit
  `docs/work/CB-2/intent.md` → Merge → innerhalb von 60 s Stufe Design → „Design starten“ → PR `CB-2/spec` →
  Merge → „Fertig“, Inhalt von Intent und Spec in der App sichtbar. Neustart schließt offene PRs der App und
  löscht deren Branches; gemergte Artefakte bleiben.
- README dokumentiert: Token einrichten, `TARGET_REPO`, Annahme öffentliches Repo, Verhalten beim Start,
  neues Ticket per md-Datei.
