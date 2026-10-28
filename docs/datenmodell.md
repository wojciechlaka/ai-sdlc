# Datenmodell

Stand: heutige App (vor dem Umbau auf das Playbook-Arbeitsmodell, siehe [architecture.md](architecture.md) §5).
Persistenz: SQLite, Schema-Validierung der JSON-Spalten via Zod.

## Überblick

```text
  +--------+ 1        n +----------+
  | Ticket |------------| AgentRun |
  +--------+            +----------+
      | 1                    | 1
      |                      |
      | n                    | n
  +------------+        +----------------+
  | AuditEvent |        | ReviewDecision |
  +------------+        +----------------+
```

`ReviewDecision` hängt zusätzlich am Ticket (`ticket_id`). Alle Fremdschlüssel löschen kaskadierend mit.

## Entitäten

### Ticket

Das Ding auf dem Board (Tabelle `tickets`).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | integer, Autoincrement | Primärschlüssel; öffentlich (DTO, Events, Agent) als `T-1` usw. |
| `title` | string | Kurztitel |
| `description` | string | der rohe Stakeholder-Text, Default `''` |
| `status` | enum | `backlog \| refining \| review \| ready \| failed`, Default `backlog`; `ready` ist reserviert und heute nicht erreichbar |
| `iteration` | integer | Anzahl der Agent-Läufe des Tickets, startet bei 0; jeder neue Run zählt hoch (auch Antwort-Läufe) |
| `created_at`, `updated_at` | timestamp | |

State Machine:

```text
                  Refine
  +---------+ --------------------------> +------------+ ---+  Rueckfrage: bleibt
  | backlog |                             |  refining  |    |  refining bis zur
  +---------+ <-------------------------- +------------+ <--+  Antwort
                  Stop                      |   ^    |
                                   Ergebnis |   |    | Fehler / Timeout
                                            v   |    v
                                     +--------+ |  +--------+
                                     | review |-+  | failed |  endgueltig bis Reset
                                     +--------+    +--------+
                                      Re-Refine
```

- **Refine** (`startRefinement`) ist nur aus `backlog` oder `review` erlaubt (`canStartRefinement`); aus
  `review` ist es ein erneutes Refinement.
- **Rückfrage:** Liefert der Agent eine `question`, bleibt das Ticket `refining`, bis der Mensch antwortet
  (`answerQuestion`); die Antwort startet einen neuen Run.
- **Ergebnis:** Liefert der Agent eine `refinement`, wechselt das Ticket nach `review`.
- **Fehler/Timeout:** Das Ticket wechselt nach `failed`. Von dort gibt es keinen Übergang außer dem Reset
  des Systems (`resetSystem`), der die Seed-Tickets wiederherstellt.
- **Stop** (`stopRefinement`): ein noch laufendes `refining` geht zurück nach `backlog`.
- Ein Ticket im Status `refining` lässt sich nicht löschen.

### AgentRun

Eine Ausführung der Agent-CLI (Tabelle `agent_runs`).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_id` | FK → Ticket | |
| `iteration` | integer | Iteration des Tickets, die dieser Run erzeugt hat |
| `trigger` | enum | `initial \| answer \| rework`; `initial` = Refine, `answer` = Fortsetzung nach Antwort; `rework` ist vorgesehen, wird heute nicht erzeugt |
| `input` | JSON | Snapshot dessen, womit der Run gestartet wurde (siehe unten) |
| `output` | JSON, nullable | Agent-Ausgabe `AgentOutput`, schema-validiert (siehe unten); `null` solange der Run läuft oder wenn er scheitert |
| `status` | enum | `running \| succeeded \| failed \| timeout` |
| `model` | string | gewähltes Modell (aus dem Input) |
| `cost_usd` | number, nullable | Kosten laut CLI-Output |
| `input_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `output_tokens` | integer, nullable | Token-Verbrauch laut CLI-Output |
| `started_at`, `finished_at` | timestamp | `finished_at` nullable |

`input` (`AgentRunInput`):

```text
{
  ticketTitle:         string
  ticketDescription:   string
  acceptanceCriteria:  string
  repo:                string                                // Git-URL oder lokaler Pfad
  model:               string
  previousRuns?:       { question: string, answer: string }[]  // Q&A-Verlauf bei Antwort-Laeufen
  feedback?:           string                                // vorgesehen, heute nicht gesetzt
}
```

### Agent-Ausgabe (JSON-Schema der `output`-Spalte)

`AgentOutput` ist eine Union über `type` (`packages/shared/src/refinementSchema.ts`):

```text
{ type: "question",   question: string }
{ type: "refinement", result:   RefinementOutput }
```

`RefinementOutput`:

```text
{
  title:               string                     // max. 60 Zeichen
  userStory:           string
  acceptanceCriteria:  string[]
  affectedFiles:       { path: string, description: string }[]
  risks:               { description: string, severity: "low" | "medium" | "high" }[]
  openQuestions:       { question: string, blocksImplementation: boolean }[]
  confidence:          integer                    // 0-100
}
```

Das aktuelle Refinement eines Tickets = `output` des letzten erfolgreichen Runs vom Typ `refinement`.

### ReviewDecision

Die menschliche Entscheidung zu einem Run (Tabelle `review_decisions`). **Tabelle vorhanden, derzeit
ungenutzt** — kein Use Case schreibt oder liest sie.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_id` | FK → Ticket | |
| `agent_run_id` | FK → AgentRun | der bewertete Run |
| `decision` | enum | `approve \| request_changes` |
| `feedback` | string, nullable | Freitext |
| `created_at` | timestamp | |

### AuditEvent

Append-only Historie (Tabelle `audit_events`).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | zufällige Hex-ID |
| `ticket_id` | FK → Ticket | |
| `actor` | enum | `human \| agent \| system` |
| `type` | string | heute erzeugt: `ticket_created` (human), `run_started` (system), `run_finished` (agent bei Erfolg, system bei Fehler/Timeout/Abbruch) |
| `payload` | JSON, nullable | `null` bzw. `{ runId }` oder `{ runId, status }` |
| `created_at` | timestamp | |

Statuswechsel des Tickets werden heute nicht als AuditEvent gespeichert, nur als Live-Event gesendet.

## Bewusst (noch) nicht modelliert

- **Project/Repo** — das Ziel-Repo ist Konfiguration
- **User/Rollen** — keine Anmeldung in der lokalen App
- **Editierte Output-Versionen** — Änderungen erfolgen künftig per PR auf das Artefakt im Repo
