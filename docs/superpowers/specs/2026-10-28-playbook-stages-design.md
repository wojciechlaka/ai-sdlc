# Design: App-Umbau auf Playbook-Stufen 1 + 2 (Intent → Spec in Git)

Datum: 2026-10-28 · Status: Teil A umgesetzt (inkl. §12), Teil B offen · Branch: `feature/playbook-stages`
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
  1 -- n  AgentRun    stage · seq · trigger initial|answer · input · output (Rueckfrage/Ergebnis) ·
                      status · model · Kosten/Tokens · Zeiten
  1 -- n  Artifact    stage · path · branch · prNumber · prUrl · prState open|merged|closed · mergedAt
  1 -- n  AuditEvent  Log: ticket_imported, run_started, run_finished, question_asked, answer_given,
                      pr_opened, pr_merged, pr_closed, stage_changed, cleanup, error
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
| `syncReviews(key?)` | für `in_review`: PR-Status lesen → gemergt: nächste Stufe; geschlossen: Branch löschen, `ready`; vorübergehender GitHub-Fehler: bleibt `in_review`, nächster Abgleich versucht es erneut; nur PR weg (404) oder kein offenes Artefakt: `ready` + `error`-Log |
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

## 12. Nachtrag: Repo-Reset über einen Showcase-Branch

Stand 2026-10-28, nach dem ersten echten Durchlauf. Ziel: Für Vorführungen lässt sich das Ziel-Repo auf den
Ausgangsstand zurücksetzen, **ohne** dass die Historie von `master` wächst oder umgeschrieben wird.

**Arbeitsbranch statt Default-Branch.** Die App arbeitet gegen den Branch `showcase` (fest vorgegeben). PRs gehen
gegen `showcase`, Inhalte (`docs/work/…`) und Stufen werden von `showcase` gelesen, Links zeigen auf
`blob/showcase/…`. `master` bleibt unberührt. Das ersetzt in §2 „PR gegen den Default-Branch“.

**Ausgangsstand.** Der Tag `showcase-base` markiert ihn. Beim Start (mit Token) gilt:
- fehlt der Tag, legt die App ihn auf den aktuellen Stand des Default-Branches (`master`);
- fehlt `showcase`, legt die App den Branch auf den Stand des Tags.
Manuelle Vorbereitung im Repo ist nicht nötig. Soll der Ausgangsstand später wandern, verschiebt man den Tag von Hand.

**Repo-Reset.**
1. offene PRs der App schließen und ihre Branches löschen (wie §3);
2. Branches `<KEY>/intent|spec` aller bekannten Tickets löschen, auch ohne offenen PR (Reste gemergter PRs);
3. `showcase` per Force auf `showcase-base` setzen — betrifft nur diesen Branch;
4. Stufen ableiten (§3) — ohne `docs/work/` stehen alle Tickets in Stufe 1.

**Auslöser.**
- **Reset-Button:** DB leeren und Start mit Repo-Reset (immer).
- **Neustart:** Repo-Reset nur mit `RESET_ON_START=true` in `apps/web/.env.local`; sonst Start wie in §3 (Merges
  nachziehen, offene App-PRs schließen, Stufe ableiten). Damit trifft ein Neustart beim Entwickeln nicht das Repo.

**Ports und Adapter.** `CodeHost` arbeitet gegen einen konfigurierten Basis-Branch (`baseBranch()` statt
`defaultBranch()`; `readFile`, `createBranch`, `openPullRequest` beziehen sich darauf). Neu:
`prepareBaseBranch()` (Tag und Branch anlegen, falls sie fehlen) und `resetBaseBranch()` (Basis-Branch per Force
auf den Tag). Der GitHub-Adapter erhält `baseBranch` und `baselineTag` als Optionen. Use Case `startup({ resetRepo })`;
`resetSystem` ruft ihn mit `resetRepo: true`.

**Fehler.** Scheitert der Repo-Reset (z. B. Branch-Schutz auf `showcase`, fehlende Rechte), läuft die App mit dem
DB-Stand weiter und schreibt eine Warnung; der Reset-Button zeigt die Meldung.

**Doku.** README: Showcase-Branch und Tag, `RESET_ON_START`, PRs gehen gegen `showcase`, `master` bleibt
unberührt; das Token braucht keine weiteren Rechte (Contents: Read and write deckt Tags und Force-Update ab,
solange `showcase` nicht geschützt ist).

**Tests.** Kern mit `FakeCodeHost` (Tag/Branch anlegen, Force-Reset, Reste-Branches löschen, Auslöser);
GitHub-Adapter mit gemocktem `fetch` (Ref-Aufrufe inkl. `force: true`); Web: Reset-Text, Hinweis auf `showcase`.

Offen für Teil B: Der Klon des Agents steht auf dem Default-Branch; Stufe 2 braucht `showcase` (fetch + checkout -B showcase), nach einem Force-Reset scheitert `git pull`.

## 13. Nachtrag: Guard- und Audit-Hooks für den Agent

Stand 2026-10-28. Ziel: Der Agent darf im Klon nur lesen — das steht heute nur im Prompt. Ein Hook setzt es
durch, und jeder Werkzeugaufruf des Agents wird nachvollziehbar (Playbook: „Governance als Code“).

**Entscheidung: kein MCP für Schreibzugriffe auf die DB.** Der Agent schreibt nie in die DB; Zustände ändern nur
die Use Cases nach den Regeln der Domäne. Ein DB-Werkzeug für den Agent würde diese Regeln umgehen. Der Hook
sitzt deshalb dort, wo das Risiko liegt: an den Werkzeugen des Agents.

**Sandbox jedes `claude`-Prozesses** (Agent und Codebase-Analyse; gebaut einmal in `compose.ts` von
`adapters/agentSandbox`, an beide Adapter gereicht):
- `--setting-sources user`: Projekt- und lokale Einstellungen des fremden Klons (`.claude/settings*.json`, samt
  deren Hooks) werden nie geladen. Unsere Hooks kommen pro Aufruf über `--settings`.
- `--allowedTools Read,Glob,Grep,Bash` (`LS` ist kein Werkzeug mehr).
- Umgebung nur aus einer Positivliste: `PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`, `SHELL`,
  Claude-Login und Anbieter, nur wenn gesetzt (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`,
  `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_MODEL`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_*`, `AWS_REGION`, `AWS_PROFILE`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID`,
  `GOOGLE_APPLICATION_CREDENTIALS`), Proxy-Variablen (`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`); dazu `REFINEMENT_HOOK_LOG`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`.
  **Kein `GITHUB_TOKEN`** und keine anderen Variablen der App. Die `.git/config` des Klons legt die App selbst an.
- **Symlinks als Dateien:** Der Klon entsteht mit `git clone -c core.symlinks=false`; ein bestehender Cache bekommt
  vor dem `pull` `core.symlinks=false` und wird danach neu ausgecheckt (`git rm -r --cached .`, `git reset --hard`).
  Ein Symlink im Ziel-Repo ist im Klon also eine Datei mit dem Linkziel als Inhalt und führt nirgendwohin.

**Hooks.**
- `PreToolUse` (Matcher: alle Werkzeuge) → `packages/core/hooks/guard.mjs`: entscheidet nach `hooks/guardPolicy.mjs`;
  Abgelehntes bekommt `permissionDecision: "deny"` und eine Begründung, der Agent arbeitet ohne den Aufruf weiter.
  **Scheitert geschlossen:** Regel und I/O werden im `try` geladen, jeder eigene Fehler lehnt ab; startet `node`
  oder das Skript gar nicht, endet der Hook-Befehl über `|| { echo 'Guard nicht ausführbar' >&2; exit 2; }` mit
  Exit-Code 2 (blockierend).
- `PostToolUse` (alle Werkzeuge) → `packages/core/hooks/audit.mjs`: hält jeden ausgeführten Aufruf fest
  (Werkzeug und Datei, Muster bzw. Befehl). Einen Exit-Code liefert das Bash-Werkzeug an den Hook nicht
  verlässlich; er wird nicht erfasst. Scheitert offen (Exit-Code 0).
- Beide Skripte sind reines Node (`.mjs`, nur `node:`-Module und Nachbarskripte, per ESLint geprüft) und schreiben
  je eine JSON-Zeile in die Datei aus `REFINEMENT_HOOK_LOG` (pro Versuch eine Datei).

**Regel (Positivliste, kein Shell-Parser).** Zum Erkunden des Codes sind `Read`, `Glob` und `Grep` da; `Bash` ist nur
eine schmale Tür für die git-Historie.
- `Read`, `Glob`, `Grep` nur **innerhalb des Klons**: `file_path`/`path` wird gegen `cwd` aufgelöst und über
  `realpath` (Symlinks!) geprüft; `~` ist nicht erlaubt. Glob-Muster (`Glob.pattern`, `Grep.glob`) dürfen nicht
  absolut sein (auch nicht in `{a,b}`) und weder `..` noch `(` (extglob), `\` oder `[/` enthalten. Der reguläre Ausdruck `Grep.pattern` ist kein Pfad
  und bleibt frei.
- `Bash` nur, wenn der Befehl höchstens 300 Zeichen hat, **keines** der Zeichen
  `` $ ` ; & | < > ( ) { } [ ] * ? ! \ ' " `` und kein Steuerzeichen (Zeilenumbruch, Tab, …) enthält — auch nicht in
  Anführungszeichen —, an einfachen Leerzeichen in Wörter zerfällt und dieser Grammatik folgt:
  `git [--no-pager] <unterbefehl> <wort>…` mit den Optionen
  `log`: `--oneline`, `-p`, `-n<zahl>`, `-<zahl>`, `--stat`, `--name-only`, `--name-status`, `--since=<datum>`,
  `--author=<name>`, `--follow`, `--` · `show`: `--stat`, `--name-only`, `--oneline`, `--` ·
  `diff`: `--stat`, `--name-only`, `--name-status`, `--no-ext-diff`, `--` · `blame`: `-L<n>,<m>` ·
  `ls-files`: `--` · `status`: `--short`, `--porcelain` · `rev-parse`: `--short`, `--abbrev-ref`.
  Andere Wörter bestehen aus `A-Z a-z 0-9 . _ / : @ = + -`, dazu `~` und `^` nur innerhalb des Worts (nicht am
  Wortanfang und nicht nach `=` oder `:`, wo die Shell `~` zum Home-Verzeichnis erweitert); sie dürfen nicht mit `/`
  beginnen und kein `..` enthalten. Revisionen sind damit `HEAD`, `HEAD~1`, `HEAD^`, `main~3`, Hashes, Branch- und
  Tag-Namen und `rev:pfad`; Bereiche `a..b` sind bewusst nicht möglich.
- Alle anderen Werkzeuge werden abgelehnt. Die Regel ist `hooks/guardPolicy.mjs` mit Tabellentests, in denen auch
  alle bekannten Umgehungen (Verkettung, Umleitung, Ersetzung, Klammer-Expansion, ANSI-C-Quoting, `/dev/tcp`,
  `git grep -O`, `sort -o`, `sed …w`, Lesen außerhalb des Klons) als Ablehnung stehen.

**Rückweg in die App.** Der Claude-CLI-Adapter legt pro Lauf die Log-Datei an, liest neue Zeilen während des Laufs
mit und meldet sie über einen neuen Rückkanal am Port: `AgentRunner.run(input, { onProgress, onToolEvent })` mit
`ToolEvent = { kind: 'blocked' | 'used', tool, target, reason? }`. Der Kern schreibt daraus
Log-Einträge `guard_blocked` (Akteur `system`, mit Begründung) und `tool_used` (Akteur `agent`) — nur solange der
Versuch aktuell ist — und sendet `progress` für blockierte Aufrufe. Die Ticketseite zeigt blockierte Aufrufe
hervorgehoben; `tool_used`-Einträge eines Laufs werden zusammengefasst angezeigt (aufklappbar), damit das Log
lesbar bleibt.

**Codebase-Analyse.** Der Lauf, der die Übersicht erzeugt (`adapters/git/repoCache.ts`), läuft in derselben Sandbox
(ohne Rückweg ins Ticket-Log; blockierte Aufrufe nur im Server-Log). Der Pfad der Skripte kommt aus der Komposition
(`resolveCorePaths` → `hooksDir` → `createAgentSandbox`), damit kein Adapter einen anderen importiert.

**Grenzen (Restrisiken).**
- Ein Hook, der in sein Zeitlimit (10 s) läuft, blockiert in Claude Code nicht; die Skripte brauchen Millisekunden.
- Das Bash-Werkzeug läuft in der Shell des Nutzers (`SHELL` wird durchgereicht); dessen eigene Startdateien
  (`.zshrc` …) können sie formen. Sie gehören dem Nutzer und gelten als vertrauenswürdig.
- Symlinks des Ziel-Repos werden als Dateien ausgecheckt; wer den Cache von Hand mit Symlinks anlegt, umgeht das bis
  zum nächsten `ensureRepo`.
- Was der Agent im Klon liest, sieht er ganz — der Klon ist öffentlich.

**Tests.** `guardPolicy` mit vielen erlaubten und verbotenen Befehlen und Pfaden; `guard.mjs`/`audit.mjs` als echte
Prozesse (stdin-JSON → stdout/Log-Datei); Guard-Befehl über `/bin/sh -c` (fehlendes Skript → Exit-Code 2, kaputte
Regel → Ablehnung); Sandbox: Flags und Umgebung (ohne `GITHUB_TOKEN`); Adapter: Sandbox im Aufruf, Mitlesen der Log-Datei;
Kern: `guard_blocked`/`tool_used` im Log, nicht bei veraltetem Versuch; Web: Darstellung im Log. Optional, nur nach
Zustimmung: ein kleiner Eval mit echtem `claude` (Haiku) in einem Temp-Ordner, der einen verbotenen Befehl
provoziert und prüft, dass er blockiert wird.
