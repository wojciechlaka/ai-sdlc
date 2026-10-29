# Datenmodell

Persistenz: SQLite über Drizzle (`packages/core/src/adapters/sqlite/schema.ts`), Typen in
`packages/core/src/domain/types.ts`. JSON-Spalten werden über die Zod-Verträge in `packages/shared` validiert.

**Inhalte liegen in Git, nicht in der Datenbank.** `intent.md` und `spec.md` stehen im Ziel-Repo auf dem
Branch `showcase`; die App liest sie beim Anzeigen live von dort. Die Datenbank hält nur Stufe, Zustand,
Verweise (Branch, PR) und das Log pro Ticket.

## Überblick

```text
                  +-------------------------+
                  | Ticket                  |
                  |   key (PK), z. B. CB-3  |
                  |   stage, state          |
                  +-------------------------+
                     | 1        | 1       | 1
         +-----------+          |         +-----------+
         | n                    | n                   | n
  +----------------+  +-------------------+  +----------------+
  | AgentRun       |  | Artifact          |  | AuditEvent     |
  |   stage, seq   |  |   stage, branch   |  |   actor, type  |
  |   input,output |  |   PR, merged_at   |  |   payload      |
  +----------------+  +-------------------+  +----------------+
```

Alle Tabellen hängen über `ticket_key` → `tickets.key` am Ticket und werden mit ihm gelöscht (`ON DELETE
CASCADE`). Der **Reset** leert so mit `tickets` die ganze Datenbank.

## Entitäten

### Ticket

Ein Ticket aus `examples/tickets/*.md` (Tabelle `tickets`). Beim Start wird jede Datei per Upsert übernommen:
neue Tickets beginnen in `plan`/`ready`, bei bekannten werden Titel, Text, Priorität und Pfad aktualisiert,
Stufe und Zustand bleiben.

| Feld | Typ | Beschreibung |
|---|---|---|
| `key` | string, PK | Ticket-Schlüssel aus der ersten Zeile der Datei, z. B. `CB-3` |
| `title` | string | Titel aus der ersten Zeile |
| `description` | string | Text der Datei, Default `''` |
| `priority` | string, nullable | aus `**Priorität:** …` |
| `source_path` | string | Pfad der Datei relativ zum Repo, z. B. `examples/tickets/cb-3-kommentare-melden.md` |
| `stage` | enum | `plan \| design \| done`, Default `plan` |
| `state` | enum | `ready \| running \| awaiting_answer \| in_review \| failed`, Default `ready` |
| `created_at`, `updated_at` | timestamp | |

### AgentRun

Ein Lauf des Agenten für eine Stufe (Tabelle `agent_runs`). Jede Antwort auf eine Rückfrage startet einen
neuen Lauf.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_key` | FK → Ticket | |
| `stage` | enum | `plan \| design` |
| `seq` | integer | laufende Nummer pro Ticket, ab 1; der Lauf mit dem höchsten `seq` ist der aktuelle Versuch |
| `trigger` | enum | `initial` (Stufe gestartet) \| `answer` (Fortsetzung nach Antwort) |
| `input` | JSON | `{ model, answeredQuestions: { question, answer }[] }` — Modell und Q&A-Verlauf der Stufe |
| `output` | JSON, nullable | `StageOutput` (siehe unten); `null`, solange der Lauf läuft oder wenn er scheitert |
| `status` | enum | `running \| succeeded \| failed \| timeout`; `succeeded` gilt für Rückfrage und Ergebnis |
| `model` | string | gewähltes Modell |
| `cost_usd` | number, nullable | Kosten laut CLI |
| `input_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `output_tokens` | integer, nullable | Token-Verbrauch laut CLI |
| `started_at`, `finished_at` | timestamp | `finished_at` nullable |

`output` ist eine Union über `type` (`packages/shared/src/intentSchema.ts`); Stufe 1 liefert:

```text
{ type: "question", question: string }
{ type: "intent",   result:   Intent }

Intent = {
  title:           string               // max. 60 Zeichen
  problem:         string
  desiredOutcome:  string
  affected:        string[]
  openPoints:      { question: string }[]
}
```

Die offene Rückfrage eines Tickets ist die `question` des letzten Laufs der aktuellen Stufe. Das Ergebnis wird
nicht als Inhalt gelesen: die App rendert daraus `intent.md` und legt die Datei per PR ab.

### Artifact

Eine Datei, die die App per Branch und PR vorgeschlagen hat (Tabelle `artifacts`). Der Inhalt steht in Git.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_key` | FK → Ticket | |
| `stage` | enum | `plan \| design` |
| `path` | string | `docs/work/<TICKET>/intent.md` bzw. `spec.md` |
| `branch` | string | `<TICKET>/intent` bzw. `<TICKET>/spec` |
| `pr_number`, `pr_url` | integer, string | PR gegen `showcase` |
| `pr_state` | enum | `open \| merged \| closed`, Default `open` |
| `merged_at` | timestamp, nullable | Zeitpunkt des Merge laut GitHub |
| `created_at` | timestamp | |

Pro Ticket und Stufe ist höchstens ein Artefakt `open`. Ein neuer Versuch nach geschlossenem PR legt ein neues
Artefakt an; die Ticketseite zeigt das jüngste.

### AuditEvent

Das Log pro Ticket, append-only (Tabelle `audit_events`); die Ticketseite zeigt es unter „Log“
(`apps/web/lib/logFormat.ts` liest die Payload-Schlüssel).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_key` | FK → Ticket | |
| `actor` | enum | `human \| agent \| system` |
| `type` | string | siehe Tabelle unten (`AuditEventType` in `ports/auditLog.ts`) |
| `payload` | JSON, nullable | je nach Typ |
| `created_at` | timestamp | |

| Typ | Akteur | Payload |
|---|---|---|
| `ticket_imported` | system | `{ sourcePath }` |
| `run_started` | system | `{ runId, stage, trigger, model }` |
| `run_finished` | agent (Erfolg), system (sonst) | `{ runId, status, reason? }`, bei Erfolg oder verworfenem Ergebnis zusätzlich `{ model, durationSeconds, costUsd, inputTokens, cacheCreationTokens, cacheReadTokens, outputTokens }` |
| `question_asked` | agent | `{ question }` |
| `answer_given` | human | `{ answer }` |
| `pr_opened` | system | `{ prNumber, prUrl, branch }` |
| `pr_merged` | human | `{ prNumber }` |
| `pr_closed` | human | `{ prNumber }` |
| `stage_changed` | system | `{ from, to }` |
| `cleanup` | system | `{ prNumber, branch }` — beim Start geschlossener PR der App |
| `error` | system | `{ message }` — fehlgeschlagener Lauf oder PR nicht mehr auffindbar |
| `guard_blocked` | system | `{ tool, target, reason }` — der Guard-Hook hat einen Werkzeugaufruf des Agents abgelehnt (`target` max. 1000 Zeichen) |
| `tool_used` | agent | `{ tool, target }` — ausgeführter Werkzeugaufruf (`target`: Befehl, Datei oder Muster, max. 200 Zeichen) |

## Stufe und Zustand

Das Ticket hat eine **Stufe** (`plan → design → done`) und darin einen **Zustand**. Die Regeln stehen als reine
Funktionen in `packages/core/src/domain/rules.ts`.

```text
                  Start                      Rueckfrage
  +---------+ ------------> +-----------+ ------------> +-----------------+
  |  ready  |               |  running  |               | awaiting_answer |
  +---------+ <------------ +-----------+ <------------ +-----------------+
    ^   ^       Stop        |        |        Antwort
    |   |                   |        |
    |   |          Ergebnis |        | Fehler / Timeout
    |   |                   |        |
    |   |                   v        v
    |   |  PR zu    +-----------+ +--------+
    |   +-----------| in_review | | failed | --Start--> running
    |               +-----------+ +--------+
    |                         |
    +- Merge: naechste Stufe -+
```

- **Start** (`startStage`) ist nur aus `ready` oder `failed` erlaubt und nur in einer startbaren Stufe
  (`STARTABLE_STAGES`, heute nur `plan`). Ohne Token lehnt die App ab.
- **Rückfrage:** Der Agent fragt → `awaiting_answer`. Die Antwort (`answerQuestion`) startet einen neuen Lauf
  mit dem ganzen Q&A-Verlauf.
- **Ergebnis:** Datei rendern, Branch anlegen, committen, PR gegen `showcase` öffnen → `in_review`.
- **Merge** (erkannt von `syncReviews`): Artefakt `merged`, Stufe `plan → design` bzw. `design → done`,
  Zustand `ready`.
- **PR ohne Merge geschlossen:** Artefakt `closed`, Branch gelöscht, `ready` in derselben Stufe. Ebenso, wenn
  der PR nicht mehr existiert (404) oder kein offenes Artefakt da ist — dann mit `error`-Eintrag.
  Vorübergehende GitHub-Fehler ändern nichts; der nächste Abgleich versucht es erneut.
- **Fehler/Timeout** → `failed`; von dort startet die Stufe erneut.
- **Stop** (`stopRun`): `running` oder `awaiting_answer` → `ready`.
- **Start der App:** Läufe im Zustand `running` enden als `failed`, das Ticket wird `ready`. Danach wird die
  Stufe aus den Dateien auf `showcase` abgeleitet (`spec.md` → `done`, `intent.md` → `design`, sonst `plan`);
  ändert sie sich, oder stand das Ticket in `in_review`, wird es `ready`.

## Alte Datenbank

Eine Datenbank im Schema vor den Playbook-Stufen (erkennbar an der Tabelle `review_decisions`) wird beim Öffnen
verworfen und von den Migrationen neu aufgebaut (`adapters/sqlite/database.ts`). Daten werden nicht übernommen.

## Bewusst nicht modelliert

- **Inhalte der Artefakte** — liegen in Git
- **Project/Repo** — das Ziel-Repo ist Konfiguration (`TARGET_REPO`)
- **User/Rollen** — keine Anmeldung in der lokalen App
