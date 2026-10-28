# Datenmodell

Stand: heutige App (vor dem Umbau auf das Playbook-Arbeitsmodell, siehe [architecture.md](architecture.md) §5).
Persistenz: SQLite, Schema-Validierung der JSON-Spalten via Zod.

## Überblick

```text
Ticket 1 ──── n AgentRun
   │                │
   │ 1              │ 1
   │                │
   n                n (0..1 pro Run)
AuditEvent     ReviewDecision
```

## Entitäten

### Ticket

Das Ding auf dem Board.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | z. B. `T-1` |
| `title` | string | Kurztitel |
| `description` | string | der rohe Stakeholder-Text |
| `status` | enum | `backlog \| refining \| review \| ready \| failed` |
| `iteration` | int | Anzahl der Refinement-Durchläufe, startet bei 0 |
| `created_at`, `updated_at` | timestamp | |

State Machine:

```text
backlog ──refine──▶ refining ──success──▶ review ──approve──▶ ready
                       │  ▲                  │
                       │  └──request changes─┘
                       └──error──▶ failed ──retry──▶ refining
```

### AgentRun

Eine Ausführung der Agent-CLI.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | |
| `ticket_id` | FK → Ticket | |
| `iteration` | int | zu welcher Iteration des Tickets der Run gehört |
| `trigger` | enum | `initial \| rework` |
| `input` | JSON | das, was tatsächlich an die CLI ging (Ticket + ggf. Feedback + vorheriger Output) |
| `output` | JSON, nullable | strukturiertes Refinement, schema-validiert (siehe unten) |
| `status` | enum | `running \| succeeded \| failed \| timeout` |
| `model` | string | verwendetes Modell laut CLI-Output |
| `cost_usd`, `tokens` | number, nullable | aus dem CLI-JSON-Output |
| `started_at`, `finished_at` | timestamp | |

### Refinement-Output (JSON-Schema der `output`-Spalte)

```text
{
  userStory:            string
  acceptanceCriteria:   string[]
  openQuestions:        string[]
  risks:                { description: string, severity: "low" | "medium" | "high" }[]
  affectedFiles:        string[]   // Pfade im Ziel-Repo
  confidence:           number     // 0–1
}
```

Das aktuelle Refinement eines Tickets = `output` des letzten erfolgreichen Runs.

### ReviewDecision

Die menschliche Entscheidung zu einem Run.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | |
| `ticket_id` | FK → Ticket | |
| `agent_run_id` | FK → AgentRun | der bewertete Run |
| `decision` | enum | `approve \| request_changes` |
| `feedback` | string, nullable | Freitext; geht beim Rework als Input in den nächsten Run |
| `created_at` | timestamp | |

### AuditEvent

Append-only Historie.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | |
| `ticket_id` | FK → Ticket | |
| `actor` | enum | `human \| agent \| system` |
| `type` | string | `ticket_created`, `run_started`, `run_finished`, `status_changed`, `review_decision`, … |
| `payload` | JSON | typabhängige Details |
| `created_at` | timestamp | |

## Bewusst (noch) nicht modelliert

- **Project/Repo** — das Ziel-Repo ist Konfiguration
- **User/Rollen** — keine Anmeldung in der lokalen App
- **Editierte Output-Versionen** — Änderungen erfolgen künftig per PR auf das Artefakt im Repo
