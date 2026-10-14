# Feature Roadmap: Agentic AI SDLC Platform

> **Hinweis (2026-06-25):** Diese Roadmap ist entlang des [Entscheidungslogs](decisions.md)
> aktualisiert. Die ursprünglichen Phasen 0/1 (Mock-Demo, Narrative Prototype) entfallen
> ersatzlos (D1) — es wird direkt echt gebaut. Der aktuelle Bau-Stand ist das repo-basierte
> Refinement-MUP in fünf Etappen (E1–E5), siehe [Phase-2-Backlog](../tickets/phase-2-backlog.md).
> Jede Phase hat ihren eigenen Backlog; diese Roadmap bleibt die strategische Klammer darüber.
> Ab Phase 3 bleibt dieses Dokument Langfrist-Zielbild.

## 1. Ziel der Roadmap

Diese Roadmap beschreibt den Weg von einem echten, minimalen Refinement-MUP zu einem pilotfähigen Enterprise-MVP. Das Produkt wird zunächst nicht als vollständig standardisierte SaaS-Lösung verstanden, sondern als Boilerplate und Beratungs-Startpunkt für Enterprise-Kunden mit individueller Toolchain, Governance und Prozesslandschaft.

Die Roadmap folgt drei Prinzipien:

1. **Real first:** statt einer gemockten Demo direkt eine echte, schmale End-to-End-Schleife bauen (D1).
2. **Module first:** einzelne SDLC-Schritte separat nutzbar machen.
3. **Integration ready:** Enterprise-Integrationen früh antizipieren, aber nicht zu früh vollständig bauen.

> **Pilot ist optional.** Alle Phasen werden produktgetrieben gebaut — die Plattform entsteht auch
> ohne Pilotteam. Wo unten von „Pilot", „Pilotteam", „Erprobungsumfang" oder Pilot-KPIs die Rede ist,
> beschreibt das eine **optionale Validierung** an einem echten Team, kein Gate für die Entwicklung.

---

## 2. Produktthese

Enterprise-Kunden wollen nicht „vollautomatisierte Softwareentwicklung“, sondern kontrollierte Produktivitätssteigerung in bestehenden SDLC-Prozessen.

Das Produkt sollte daher als **Agentic SDLC Control Layer** positioniert werden:

> Eine modulare Steuerungs- und Review-Oberfläche, die Agenten in bestehende Tools wie Jira, Confluence, Git-Repositories, CI/CD und Chat integriert und menschliche Kontrolle an definierten Gates sicherstellt.

---

## 3. Roadmap-Phasen

## Phasen 0 & 1 (entfallen)

> **Entfallen lt. [D1](decisions.md).** Die ursprünglich geplante Clickable/Mocked Demo
> (Phase 0) und der Narrative Prototype (Phase 1) werden nicht gebaut. Statt einer gemockten
> Demo wird direkt eine echte, minimale Plattform gebaut. Der Inhalt dieser Phasen (Kanban,
> Detail-Drawer, Review-Loop, Audit-Trail) ist real in Phase 2 (E1–E5) aufgegangen — ohne
> Simulation, Mock-Connectoren und Demo-Personas. Die historischen Beschreibungen wurden
> aus diesem Dokument entfernt; bei Bedarf in der Git-Historie nachschlagbar.

---

## Phase 2: Repo-basiertes Refinement-MUP (aktuell)

### Ziel

Eine echte, schmale End-to-End-Schleife: Ein Ticket wird durch einen Coding-Agent gegen ein
echtes Ziel-Repo refined, von einem Menschen geprüft und freigegeben — alles persistent und
auditierbar. Kein Mock, keine Simulation.

### Status

In Umsetzung. **Backlog:** [tickets/phase-2-backlog.md](../tickets/phase-2-backlog.md) —
dort stehen Tickets, Reihenfolge und Akzeptanzkriterien. Überblick über die Etappen:

| Etappe | Inhalt |
|---|---|
| E1 | Refinement-Spike: Coding-Agent-CLI als Engine, headless, gegen Beispiel-Repo |
| E2 | Datenmodell + Backend + Persistenz, „Kanban als JSON-API” |
| E3 | Mini-Frontend: Kanban-Board, Ticket anlegen, Detail-Drawer |
| E4 | Human-in-the-Loop: Review-Schleife mit Rework + Audit-Trail |
| E5 | Härtung & Konfiguration: Repo konfigurierbar, Live-Progress, Fehlerzustände, Import |

### Erster echter Use Case

**Backlog Refinement gegen ein Code-Repo** (zunächst [qvest-digital/coffee-chat](https://github.com/qvest-digital/coffee-chat), D8).

Warum dieser Zuschnitt zuerst?

- niedrigeres Risiko als Codeänderungen (Refinement schreibt nicht in den Code)
- der Coding-Agent kann reale Dateien/Konzepte des Repos referenzieren → konkretere Outputs
- gut geeignet für Human-in-the-Loop
- leicht messbar durch Qualität der Tickets und Review-Zeit
- **bewusst ohne Jira/Confluence** im MUP — diese Integrationen kommen erst in Phase 3 (D3, D8)

### Muss-Features

| Feature | Beschreibung |
|---|---|
| Coding-Agent-CLI | Refinement-Engine als Headless-CLI (`claude -p`, JSON-Output), gekapselt hinter schmaler Schnittstelle — **kein eigener Orchestrator** (D3) |
| Strukturierter Output | schema-validiert (Zod): User Story, Akzeptanzkriterien, offene Fragen, Risiken, betroffene Dateien, Confidence (D5) |
| Asynchrone Agent-Runs | Run anstoßen + Status pollen, später SSE (D4) |
| Kanban-Board | Spalten `backlog \| refining \| review \| ready`, `failed` als Badge |
| Human Review | Approve / Request Changes mit Feedback — **kein „Edit & Approve”** im MUP (D9) |
| Rework-Schleife | Feedback + vorheriger Output gehen als Input in den nächsten Run; Iteration zählt hoch |
| Audit Log | append-only AuditEvents über alle Agenten-/Menschaktionen (D6) |
| Repo-Konfiguration | Ziel-Repo als Config, keine Project-Entität (D8) |

### Architektur-Bausteine

- **Stack: TypeScript end-to-end** (D2) — ein Repo, eine Sprache, geteilte Typen
- Frontend: Vite / React
- Backend: Node.js / Hono
- Datenhaltung: **SQLite** (lokal, kein Infra-Overhead in der MUP-Phase) (D2)
- Orchestrierung: **kein** eigener Agent-Service — Coding-Agent als CLI (D3)
- Logging: AuditEvents und AgentRuns persistent (D6)
- Datenmodell: siehe [docs/datenmodell.md](datenmodell.md)

> Auth/SSO, Multi-Tenant, Postgres und Containerisierung sind im MUP **bewusst nicht** enthalten —
> sie kommen mit Phase 3.

### Akzeptanzkriterien

- Ein Ticket kann angelegt und gegen das konfigurierte Repo refined werden.
- Der Coding-Agent erzeugt einen schema-validierten Refinement-Output mit Repo-Bezug.
- Ein Mensch kann den Output prüfen, freigeben oder mit Feedback zurückweisen (Rework).
- Die komplette Schleife (refine → review → request changes → rework → approve) ist aus dem UI durchspielbar.
- Alle Aktionen sind auditierbar.

---

## Phase 3: Geteilte DB + lokale App

> **Architektur/Topologie** dieser Phase ist kanonisch in [architecture.md](architecture.md) beschrieben
> (Deployment-Sicht, Datenfluss, Vertrauensgrenze, Sequenzen).

**Backlog:** noch nicht angelegt (entsteht bei Phasenstart als `tickets/phase-3-backlog.md`).

### Ziel

Aus dem Einzelplatz-MUP wird ein **Team-Werkzeug**: mehrere Nutzer arbeiten am selben Board und
teilen Ergebnisse, Skills, Agent-Definitionen und Integrationen — während die Agent-Runs weiterhin
**lokal** unter den Credentials des jeweiligen Nutzers laufen. Optional kann ein Pilotteam das
Ganze in einem echten Prozess erproben, zunächst parallel zum bestehenden Arbeitsablauf — nötig
für die Phase ist das nicht.

### Architektur-Leitidee: geteilte Datenhaltung, lokale App (D10, D17)

Der Schnitt ist bewusst minimal gehalten: **geteilt ist nur die Datenhaltung**, alles andere bleibt der
lokale Phase-2-Monolith:

- **Geteilte Datenhaltung** (remote Postgres, die einzige geteilte Komponente): Quelle der Wahrheit und
  Kollaborationspunkt. Datenmodell (Tickets, Runs, Reviews, Audit), **Ergebnisse** und die geteilten
  **Registries** (Skills, Agent-Definitionen, Integrationen). Hält **keine Secrets** (D11).
- **Lokale App** (pro Nutzer): Frontend, Backend und Agent-Ausführung laufen lokal — der an die geteilte
  DB angebundene Phase-2-Monolith. Der Run läuft in-process unter den **lokalen** Credentials des Nutzers
  gegen einen lokalen Repo-Checkout (acts-as-user).

Bewusst **kein** separater gehosteter Anwendungs-Server und **kein** Runner-Dispatch (D17): das halbiert
den Bau-Aufwand. Harte Invarianten (z. B. „kein paralleles Refine pro Ticket", append-only Audit) werden
als **DB-Constraints** erzwungen; die geteilte DB ist die Vertrauensgrenze (vertrauenswürdiges Team).

### Credential-Modell: Voll BYO lokal (D11)

- LLM-Sub und Tokens für externe Systeme bleiben **lokal beim Nutzer** — die geteilte DB hält keine
  Secrets. Damit entfällt eigenes Enterprise-IAM, und externe Aktionen laufen natürlich als
  „acts-as-user" (saubere Attribution, least privilege).
- Tokens/Config werden über die **GUI** der lokalen App hinterlegt und nur lokal gespeichert.
- Konsequenz: **SSO/OIDC wird in Phase 3 nicht gebraucht** und wandert nach Phase 5 (D13, D14).

### Frictionless Onboarding (Kern-Deliverable)

Der Aufwand „lokale App pro Nutzer" wird über **Packaging** gelöst: **ein Befehl** (z. B. `npx …` /
Install-Skript) bringt die lokale App ans Laufen und bindet sie via Invite/Config an die geteilte DB;
auch ein Nicht-Techie (PO/PM) führt das aus, alles Weitere (Tokens, Repo, Modell) wird in der GUI
konfiguriert. Die Setup-Komplexität ist wegabstrahiert.

### Externe Integrationen: flexible Zugriffsadapter (D12)

Statt eines hartcodierten Jira-Connectors entsteht eine **Integrations-Registry mit austauschbaren
Zugriffsadaptern** — MCP ist *eine* Option, nicht Pflicht:

- **Direkter API-Call** — wo wenig Kontext nötig ist (z. B. Jira: einzelne Tickets lesen/kommentieren).
- **MCP-Server** — für reichere Dienste mit vielen Tools.
- **CLI-Tool** — wo schon ein Kommandozeilen-Werkzeug existiert.

Zentral wird kuratiert, *welche* Integrationen + Scopes erlaubt sind; die lokalen Apps konsumieren die
Registry und verdrahten den Agenten entsprechend. Jira/Confluence/GitHub werden damit **Instanzen**
desselben Modells. Der Audit erfasst, welcher Agent welches externe System berührt hat.

### Geteilte Definitionen (Minimal-Vorzug aus Phase 5)

- **In Phase 3:** Registries für **Skills**, **Agent-Definitionen** und **Integrationen** — zentral
  definiert, lokal konsumiert. Inkl. **RBAC-lite**: Rolle **Kurator/Admin** (darf Registries
  editieren/freigeben) vs. **Member** (refined, reviewed) (D13).
- **Bleibt Phase 5:** Versionierung & Playbook-**Studio** (UI), Evaluation-Layer, Policy-Engine,
  Multi-Tenant, Environments, Data-Boundary/Retention, volles Enterprise-RBAC + SSO/OIDC (D14).

### Erprobungsumfang (optional)

Falls an einem echten Team validiert wird, ein sinnvoller Zuschnitt:

- 1 Team, mehrere Nutzer (inkl. Nicht-Techies via GUI)
- 1 SDLC-Modul (Backlog Refinement)
- 1 bis 2 Ziel-Repos; optionale externe Integrationen je nach Bedarf
- 20 bis 50 Tickets
- menschliche Freigabe immer erforderlich

### KPIs (bei Erprobung)

| KPI | Bedeutung |
|---|---|
| Ticket Refinement Time | Zeit bis „Ready for Dev“ |
| Agent Acceptance Rate | Anteil direkt akzeptierter Outputs |
| Rework Rate | Anteil zurückgewiesener oder überarbeiteter Outputs |
| Reviewer Time | Aufwand der menschlichen Prüfung |
| Ticket Quality Score | qualitative Bewertung der Akzeptanzkriterien |
| Developer Satisfaction | subjektive Entlastung |
| Lead Time Impact | Einfluss auf Delivery-Zeit |
| Governance Findings | Auditierbarkeit und Compliance-Akzeptanz |

### Akzeptanzkriterien

- Mehrere Nutzer teilen über die geteilte DB Board, Ergebnisse, Skills und Agent-Definitionen.
- Ein Nicht-Techie bekommt mit **einem** Befehl + GUI-Konfiguration eine lauffähige lokale App.
- Agent-Runs laufen lokal unter den Credentials des Nutzers; die geteilte DB hält keine Secrets.
- Mindestens eine externe Integration ist über die Registry nutzbar — als direkter API-Call (Jira),
  MCP als andockbare, in Phase 3 nicht gebaute Option — ohne Code-Änderung an der Plattform.
- Parallele Runs verschiedener Nutzer kollidieren nicht (Concurrency-Invariante als DB-Constraint).
- Der zentrale Audit zeigt Akteur und berührte externe Systeme.
- *(bei Erprobung)* IT/Security akzeptiert das Datenfluss- und Zugriffskonzept; ein messbarer Engpass wird reduziert.

---

## Phase 4: Multi-Module SDLC-Expansion

**Backlog:** noch nicht angelegt (entsteht bei Phasenstart als `tickets/phase-4-backlog.md`).

### Ziel

Die in Phase 2/3 etablierte Schleife (Agent-Run → Review → Audit, lokal ausgeführt, geteilt über die
DB) wird auf **weitere SDLC-Schritte** ausgeweitet. Aus dem Ein-Modul-Werkzeug
(Backlog Refinement) wird eine Sammlung von Modulen, die dieselbe Infrastruktur (lokale Ausführung,
Registries, Integrations-Adapter) wiederverwenden. **Plattform-/Enterprise-Ausbau ist nicht Teil
dieser Phase** — er folgt in Phase 5 (D14).

### Zeitraum

3 bis 6 Monate nach Phase 3 (eine erfolgreiche Erprobung ist hilfreich, aber keine Voraussetzung)

### Module

Backlog Refinement (Phase 2/3) ist die Baseline. Phase 4 ergänzt sukzessive:

| Modul | Priorität | Grund |
|---|---:|---|
| Code Review Assistant | P0 | klarer Entwicklernutzen |
| Test Case Generation | P1 | gut automatisierbar |
| Release Notes | P1 | geringe technische Tiefe, sichtbarer Output |
| Documentation Update | P1 | Confluence-Nutzen |
| Solution Design | P2 | stärker kundenspezifisch |
| Deployment Readiness | P2 | benötigt tiefe CI/CD-Integration |
| Incident-to-Backlog | P2 | interessant für Betrieb und Support |
| Autonomous Implementation | P3 | höchstes Risiko, erst später |

> Jedes neue Modul ist im Kern eine eigene Agent-Definition + Skill(s) + ggf. Integrationen über die
> bestehende Registry (D12) — die Plattform selbst muss dafür nicht umgebaut werden. Wo ein Modul
> mehr braucht (z. B. PR-Erstellung mit Schreibrechten), ist das ein Treiber für Phase 5.

---

## Phase 5: Enterprise Platform

**Backlog:** noch nicht angelegt (entsteht bei Phasenstart als `tickets/phase-5-backlog.md`).

### Ziel

Aus dem Multi-Modul-Baukasten wird eine bei Enterprise-Kunden betreibbare, governance-fähige
Plattform — Mehrmandanten-Betrieb, zentrale Identität, Auto-Approval-Policies, Mess- und
Steuerbarkeit der Agent-Qualität.

### Zeitraum

nach erfolgreicher Modul-Expansion (Phase 4)

### Plattformfeatures

> Die **minimalen** Registries (Skills, Agent-Definitionen, Integrationen) und RBAC-lite entstehen
> bereits in Phase 3 (D10, D12, D13). Phase 5 baut darauf den Vollausbau: Governance, Studio-UI,
> Versionierung, Evaluation, Multi-Tenant und Enterprise-Auth.

| Feature | Beschreibung |
|---|---|
| Workflow Builder | Module und Gates kundenspezifisch konfigurieren |
| Connector Framework | wiederverwendbare Integrationsadapter (Ausbau der Phase-3-Registry, D12) |
| Policy Engine | Regeln für Auto-Approval, Eskalation, Human Review |
| Agent Registry | Vollausbau der Phase-3-Agent-Registry: Versionierung, Verwaltung |
| Prompt/Playbook Studio | kundenspezifische Prompts und Rubrics (UI) |
| Evaluation Layer | Qualität der Agent Outputs messen |
| Enterprise Audit | revisionssichere Historie |
| SSO/OIDC + Enterprise-RBAC | zentrale Identität und volle Rechte-Matrix (aus Phase 3 vorbereitet, D13) |
| Multi-Tenant Support | mehrere Kunden/Organisationen |
| Environment Support | Dev, Test, Prod |
| Data Boundary Controls | Datenzugriff, Redaction, Retention |

---

## 4. Integrations-Roadmap

## 4.1 Priorität P0

Diese Integrationen sollten früh antizipiert werden. Da der Mock-Schritt entfällt (D1), werden
sie bei tatsächlichem Bedarf direkt angebunden. Ab Phase 3 laufen externe Systeme über die
Integrations-Registry mit austauschbaren Adaptern (API/MCP/CLI, D12).

| Integration | Warum wichtig | Frühester Einsatz |
|---|---|---|
| Git-Repo (GitHub/GitLab/Bitbucket) | Code-Kontext für Refinement | **Phase 2 (MUP)** — Repo-Checkout, lesend |
| Jira | Backlog, Tickets, Status, Kommentare | Phase 3 — via Registry (Read, dann Write/Comment) |
| Confluence | Requirements, Kontext, Dokumentation | Phase 3 — via Registry (Read) |
| Slack/Teams | Notifications und Review Reminders | Phase 3+ |
| SSO/OIDC | Enterprise-Anforderung | **Phase 5** — in Phase 3 BYO lokal, kein SSO nötig (D11, D13) |

## 4.2 Priorität P1

| Integration | Warum wichtig |
|---|---|
| CI/CD: GitHub Actions, GitLab CI, Jenkins, Azure Pipelines | Build/Test/Deploy-Status |
| Azure DevOps | Alternative zu Jira/GitHub |
| SonarQube | Code Quality |
| Snyk / Dependabot / Security Scanner | Security Checks |
| TestRail / Zephyr | Testmanagement |
| ServiceNow | Change/Incident-Prozesse |

## 4.3 Priorität P2

| Integration | Warum wichtig |
|---|---|
| Datadog / Grafana / Prometheus | Observability |
| Sentry | Fehler zu Tickets |
| SharePoint | Enterprise-Dokumentation |
| Miro / FigJam | Discovery-Artefakte |
| Feature Flag Tools | LaunchDarkly, ConfigCat etc. |
| Enterprise DWH | Reporting und Management-KPIs |

---

## 5. Feature-Priorisierung

## 5.1 P0: MUP — echte Refinement-Schleife (E1–E5)

- Coding-Agent-CLI als Refinement-Engine (echt, nicht simuliert)
- Kanban Board
- Ticket Detail Drawer
- Asynchrone, persistente Agent-Runs
- Human Review (Approve / Request Changes)
- Rework-Schleife mit Feedback-Kontext
- Audit Trail
- Risk/Confidence Indicator

## 5.2 P1: Pilotfähigkeit

- Geteilte DB + lokale App pro Nutzer (D10, D17)
- Integrations-Registry mit Adaptern: API / MCP / CLI (D12)
- Jira / Confluence über die Registry
- Frictionless Onboarding der lokalen App (ein Befehl + GUI-Config)
- Skill- und Agent-Definitions-Registry (geteilt)
- RBAC-lite (Kurator / Member)
- Review Rubrics
- Admin-Konfiguration
- Basic Analytics
- Prompt Templates
- Error States

## 5.3 P2: Skalierung

- SSO/OIDC + volles Enterprise-RBAC (D13)
- Multi-Module Workflows
- Connector SDK
- Policy Engine
- Evaluation Layer
- Custom Agent Playbooks (Playbook-Studio)
- Data Retention Policies
- Tenant Management
- Advanced Analytics
- CI/CD Integration

## 5.4 P3: Tiefe Automatisierung

- PR-Erstellung
- automatische Testgenerierung mit Repo-Kontext
- Deployment Readiness Checks
- Release Orchestration
- Semi-autonomous Implementation
- Cross-team Planning
- Change Management Integration

---

## 6. Packaging-Idee

Da viel Integration und Consulting nötig sein wird, sollte das Angebot nicht nur als Softwareprodukt formuliert werden.

## 6.1 Mögliche Pakete

### Package 1: Agentic SDLC Demo Sprint

- 1 bis 2 Wochen
- kundenspezifische Demo mit gemockten Daten
- ein Zielprozess
- Ergebnis: Demo + Opportunity Assessment

### Package 2: SDLC Agent Pilot

- 8 bis 12 Wochen
- ein echtes Modul
- Jira/Confluence-Anbindung
- Pilotteam
- Erfolgsmessung

### Package 3: Enterprise Agentic SDLC Platform

- mehrere Module
- mehrere Teams
- Governance
- SSO/RBAC
- Connector Framework
- Betriebsmodell

---

## 7. Empfohlener nächster Schritt

Die allererste Version bleibt bewusst eng: das repo-basierte Refinement-MUP entlang der
Etappen E1–E5 (siehe [Phase-2-Backlog](../tickets/phase-2-backlog.md)):

1. **E1** — Refinement-Spike: beweisen, dass die Coding-Agent-CLI als Engine taugt (gegen Beispiel-Repo, headless).
2. **E2** — Datenmodell, Backend und Persistenz; „Kanban als JSON-API".
3. **E3** — Mini-Frontend: Kanban-Board, Ticket anlegen, Detail-Drawer.
4. **E4** — Human-in-the-Loop: Review-Schleife mit Rework und Audit-Trail.
5. **E5** — Härtung: Repo konfigurierbar, Live-Progress, Fehlerzustände, Ticket-Import.

Der erste echte Use Case ist **Backlog Refinement gegen ein Code-Repo**, weil er risikoarm
(schreibt nicht in den Code), durch den Repo-Kontext konkret und für Human-in-the-Loop gut
geeignet ist. Branchen-Narrative (Logistik, Telekommunikation, Medien) und Enterprise-Tooling
(Jira/Confluence) folgen erst ab Phase 3.
