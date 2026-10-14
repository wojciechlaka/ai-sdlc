# Datenmodell

Stand: 2026-06-10. Zugehörige Entscheidungen: [D5–D8 im Entscheidungslog](decisions.md).
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

Das aktuelle Refinement eines Tickets = `output` des letzten erfolgreichen Runs (D5).

### ReviewDecision

Die menschliche Entscheidung zu einem Run (D7).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | |
| `ticket_id` | FK → Ticket | |
| `agent_run_id` | FK → AgentRun | der bewertete Run |
| `decision` | enum | `approve \| request_changes` |
| `feedback` | string, nullable | Freitext; geht beim Rework als Input in den nächsten Run |
| `created_at` | timestamp | |

### AuditEvent

Append-only Historie (D6).

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | string | |
| `ticket_id` | FK → Ticket | |
| `actor` | enum | `human \| agent \| system` |
| `type` | string | `ticket_created`, `run_started`, `run_finished`, `status_changed`, `review_decision`, … |
| `payload` | JSON | typabhängige Details |
| `created_at` | timestamp | |

## Bewusst (noch) nicht modelliert

- **Project/Repo** — Ziel-Repo ist Konfiguration (D8)
- **User/Rollen** — kein Auth im MUP
- **Editierte Output-Versionen** — kein „Edit & Approve" im MUP (D9)

---

## Phase-3-Erweiterungen (geteilte DB, lokale App)

Stand: 2026-06-25. Zugehörige Entscheidungen: [D10–D17](decisions.md). In Phase 3 wandert die Persistenz
von lokaler SQLite in eine **geteilte remote Postgres** (die einzige geteilte Komponente, secret-frei);
Frontend, Backend und Ausführung laufen lokal pro Nutzer ([D17](decisions.md)).

### Änderungen an bestehenden Entitäten

- **AgentRun.status** bleibt wie in Phase 2 (`running | succeeded | failed | timeout`) — **kein** `pending`,
  da der Run in-process im lokalen Backend startet (kein Dispatch, [D17](decisions.md)).
- **AgentRun** bekommt eine **Lease** (`lease_expires_at` / Heartbeat) und referenziert den ausführenden
  `user_id`: ein `running`-Run mit abgelaufener Lease (Client abgestürzt) gilt als stale und gibt das
  Ticket wieder frei.
- **AuditEvent** bekommt Akteur-Attribution (User/Rolle) und ein optionales Feld für ein berührtes
  externes System (Integration, Aktion, Scope).

### Neue Entitäten

| Entität | Zweck | Felder (Skizze) |
|---|---|---|
| `User` | Identität + RBAC-lite | `id`, `name`, `email`, `role` (`kurator \| member`) |
| `Project` | mehrere Ziel-Repos statt Konfiguration ([D8](decisions.md)) | `id`, `name`, `repo_url` |
| `Skill` | geteilte, zentral definierte Skill-Definition | `id`, `name`, `definition` (jsonb) |
| `AgentDefinition` | geteilte Agent-Definition; referenziert Skills + erlaubte Integrationen | `id`, `name`, `definition` (jsonb), `skill_ids[]`, `integration_ids[]` |
| `Integration` | kuratierter externer Zugriff, austauschbarer Adapter ([D12](decisions.md)) | `id`, `name`, `adapter_type` (`api \| mcp \| cli`), `config` (jsonb), `scopes[]` |

Wichtig (secret-frei, [D11](decisions.md), [D17](decisions.md)): `Integration` speichert nur Konfiguration +
erlaubte Scopes, **keine Tokens**. LLM- und externe Tokens liegen ausschließlich lokal in der App des
Nutzers, nie in der geteilten DB.

### Enforcement & Trust

Harte Invarianten liegen in der DB: „kein paralleles Refine pro Ticket" als partieller Unique-Index auf
aktive (`running`) Runs eines Tickets; `AuditEvent` append-only **per Trigger** (UPDATE/DELETE abgelehnt)
bzw. restriktive DB-Rolle. RBAC-lite (Kurator/Member), Status-Übergänge und Business-Regeln werden
clientseitig durchgesetzt — die geteilte DB ist die Vertrauensgrenze, harte Rechte-Durchsetzung erst
Phase 5 ([D14](decisions.md), [D17](decisions.md)). Der DB-Zugang selbst ist ein lokal zu schützendes
Geheimnis (wie LLM-/externe Tokens); „secret-frei" bezieht sich auf in der DB gespeicherte LLM-/externe
Tokens, nicht auf die DB-Zugangsdaten.

### Nicht mehr „bewusst nicht modelliert"

`Project/Repo` und `User/Rollen` (oben unter Phase 2 noch ausgeklammert) werden in Phase 3 modelliert.
Weiterhin **nicht** modelliert: editierte Output-Versionen (kein Edit & Approve, [D9](decisions.md)),
Multi-Tenant/Environments und feingranulares Enterprise-RBAC (Phase 5, [D14](decisions.md)).
