# UI/UX Concept: Agentic AI SDLC Platform

## 1. Zielbild

Die Demo zeigt eine Enterprise-fähige Plattform, die den Software Development Lifecycle von Backlog bis Release agentisch unterstützt. Der Fokus liegt nicht auf vollständiger Automatisierung, sondern auf kontrollierter Zusammenarbeit zwischen Mensch und Agent.

Das Kernversprechen:

> Ein Ticket bewegt sich sichtbar durch den SDLC. Agenten übernehmen definierte Arbeitsschritte, Menschen behalten Kontrolle an kritischen Gates.

Für die erste Demo reicht ein gemockter Frontend-State. Entscheidend ist, dass der Workflow greifbar wird: ein festes Ticket wird eine oder mehrere Stufen weitergeschoben, der Agent arbeitet scheinbar, erzeugt ein Artefakt, und ein Mensch kann freigeben, zurückweisen oder kommentieren.

---

## 2. UX-Prinzipien

### 2.1 Human-in-the-Loop statt Autopilot

Enterprise-Kunden werden keine Blackbox akzeptieren, die autonom Tickets bis Produktion bringt. Die UX muss deshalb zeigen:

- Wer entscheidet?
- Was hat der Agent getan?
- Welche Quellen wurden genutzt?
- Welche Risiken oder Unsicherheiten gibt es?
- Wo kann ein Mensch eingreifen?
- Was passiert nach Freigabe oder Ablehnung?

Die Plattform sollte nicht als „AI ersetzt Entwickler“ wirken, sondern als kontrollierbarer SDLC-Co-Pilot.

### 2.2 Kanban als mentale Brücke

Ein Kanban-artiges Board ist für Produkt-, Engineering- und Delivery-Teams sofort verständlich. Es eignet sich gut, weil es bestehende Jira-/Azure-DevOps-Mentalmodelle aufgreift.

Wichtig ist jedoch, dass das Board nicht nur lineare Spalten abbildet. Agentische Workflows sind iterativ. Ein Ticket kann nach Review wieder zurück zum Agenten, mit Feedback, neuen Constraints oder abgelehnter Lösung.

### 2.3 Transparenz vor Magie

Die Demo sollte jede Agentenaktion sichtbar machen:

- Input des Agenten
- verwendeter Kontext
- erzeugter Output
- Confidence/Risiko
- benötigter menschlicher Review
- nächster empfohlener Schritt

Das erzeugt Vertrauen, gerade bei Enterprise-Stakeholdern aus IT, Security, Legal und Management.

### 2.4 Modularität als Produktlogik

Nicht jeder Kunde wird den gesamten SDLC automatisieren wollen. Das UI sollte deshalb von Anfang an modular wirken:

- nur Backlog Refinement
- nur Spec Generation
- nur Code Review
- nur Test Case Generation
- nur Release Notes
- End-to-End SDLC als Zielbild

Die Demo kann den End-to-End-Flow zeigen, sollte aber klar vermitteln, dass einzelne Module separat aktiviert werden können.

---

## 3. Kern-UI

## 3.1 Hauptscreen: Agentic SDLC Board

Das zentrale UI ist ein horizontales Board mit klar getrennten Agent- und Human-Phasen.

Empfohlene Spalten für die Demo:

1. **Backlog**
2. **Refinement Agent**
3. **PM Review**
4. **Implementation Agent**
5. **Code Review**
6. **QA / Test Agent**
7. **Release Approval**
8. **Released**

Für eine minimalere Demo reichen:

1. **Backlog**
2. **Agent Working**
3. **Human Review**
4. **Approved**

### Beispiel-Wireframe

```text
┌──────────┐ ┌────────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────┐
│ Backlog  │ │ Refinement AI  │ │ PM Review    │ │ Implementation │ │ Code Review  │
│          │ │                │ │              │ │ AI             │ │              │
│ [Ticket] │ │ [Ticket]       │ │ [Ticket]     │ │ [Ticket]       │ │ [Ticket]     │
└──────────┘ └────────────────┘ └──────────────┘ └────────────────┘ └──────────────┘
```

Jede Karte zeigt:

- Ticket-ID
- Titel
- Priorität
- Status
- verantwortliche Rolle
- Agent-Modul
- aktueller Blocker oder Review-Gate
- letzte Agentenaktion
- Risikoindikator

---

## 3.2 Ticket Card

Eine Ticketkarte sollte kompakt bleiben, aber genug Kontext für eine Demo liefern.

### Beispielkarte

```text
DP-142
Sendungsverfolgung: ETA genauer anzeigen

Status: PM Review
Agent: Refinement Agent
Confidence: 82 %
Risk: Medium
Needs Human: Acceptance Criteria prüfen

[Review öffnen]
```

### Card-Zustände

- **Idle:** Ticket liegt im Backlog.
- **Agent Running:** Ladezustand mit simuliertem Fortschritt.
- **Needs Review:** Mensch muss entscheiden.
- **Changes Requested:** Mensch hat Feedback gegeben.
- **Approved:** Gate bestanden.
- **Blocked:** fehlender Kontext, fehlende Rechte oder Integrationsproblem.
- **Completed:** Modul abgeschlossen.

---

## 3.3 Ticket Detail Drawer

Ein Klick auf eine Karte öffnet rechts einen Detail Drawer. Der Drawer ist das wichtigste Vertrauenselement.

### Struktur des Drawers

1. **Overview**
   - Ticketbeschreibung
   - Business-Ziel
   - aktueller Status
   - nächster Schritt

2. **Agent Output**
   - erzeugte User Story
   - Akzeptanzkriterien
   - technischer Plan
   - Testfälle
   - Pull-Request-Zusammenfassung
   - Release Notes

3. **Context Used**
   - Jira-Ticket
   - Confluence-Seite
   - Code-Dateien
   - relevante frühere Tickets
   - API-Spezifikation

4. **Risk & Confidence**
   - Confidence Score
   - erkannte Unsicherheiten
   - Security-/Compliance-Hinweise
   - fehlende Informationen

5. **Human Decision**
   - Approve
   - Request Changes
   - Escalate
   - Edit & Approve
   - Skip module

6. **Audit Trail**
   - wer hat was wann entschieden
   - Agentenaktionen
   - Prompts/Inputs abstrakt
   - Output-Versionen
   - Feedback-Schleifen

---

## 4. Wichtigster Demo-Flow

## 4.1 Demo-Szenario

Ein festes Ticket wird aus dem Backlog in den Refinement-Prozess geschoben.

### Beispiel-Ticket

**Ticket:** „Als Kunde möchte ich in der Sendungsverfolgung eine präzisere voraussichtliche Lieferzeit sehen, damit ich meine Anwesenheit besser planen kann.“

### Ablauf

1. Nutzer klickt auf **Run Refinement Agent**.
2. Ticket wechselt in **Refinement Agent**.
3. UI zeigt simulierte Agentenarbeit:
   - „Reading Jira ticket“
   - „Searching Confluence“
   - „Checking related incidents“
   - „Drafting acceptance criteria“
4. Agent erzeugt:
   - verbesserte User Story
   - Akzeptanzkriterien
   - offene Fragen
   - Risiko- und Dependency-Hinweise
5. Ticket wechselt in **PM Review**.
6. Mensch kann:
   - freigeben
   - Änderungen anfordern
   - direkt editieren und freigeben
7. Nach Freigabe springt Ticket optional in **Implementation Agent** oder endet für die Demo bei **Ready for Dev**.

---

## 4.2 Simulierter Agent Output

### Refined Story

```markdown
Als registrierter Empfänger möchte ich in der Sendungsverfolgung ein genaueres Lieferzeitfenster sehen, damit ich meine Anwesenheit besser planen kann.
```

### Acceptance Criteria

```markdown
- Lieferzeitfenster wird angezeigt, sobald ausreichend ETA-Daten vorliegen.
- Bei unzureichender Datenqualität wird ein breiteres Zeitfenster angezeigt.
- Nutzer sieht Zeitpunkt der letzten ETA-Aktualisierung.
- Bei verspäteter Sendung wird ein Hinweistext angezeigt.
- Tracking-Seite bleibt auch ohne Login nutzbar, sofern Tracking-ID vorhanden ist.
```

### Open Questions

```markdown
- Welche ETA-Quelle ist für Pilotregionen verfügbar?
- Gibt es regulatorische Einschränkungen zur Standortgenauigkeit?
- Soll das Feature zuerst nur für eingeloggte Nutzer aktiviert werden?
```

### Risk Assessment

```markdown
Risk: Medium
Reason: Abhängigkeit von ETA-Datenqualität und Backend-Schnittstelle.
Human Review Required: Product Owner + Backend Lead.
```

---

## 5. Human-in-the-Loop UX

## 5.1 Review Actions

Jeder Review-Schritt braucht wenige, klare Aktionen:

- **Approve**
- **Request Changes**
- **Edit & Approve**
- **Escalate**
- **Reject Agent Output**

Für die Demo reichen drei Buttons:

- Approve
- Request Changes
- Show Diff

## 5.2 Feedback an Agenten

Wenn der Mensch Änderungen anfordert, sollte er strukturiertes Feedback geben können.

Beispiel:

```text
Feedback type:
[ ] Requirements unclear
[ ] Missing compliance check
[ ] Too technical
[ ] Missing test cases
[ ] Wrong assumption
[ ] Other
```

Kommentar:

```text
Bitte Akzeptanzkriterien um Datenschutz-Hinweis ergänzen und Feature Flag erwähnen.
```

Danach wechselt das Ticket zurück in **Refinement Agent** mit Badge „Iteration 2“.

---

## 6. Modularisierbarkeit

Die Plattform sollte als Set von SDLC-Modulen dargestellt werden.

## 6.1 Module

| Modul | Zweck | Human Gate |
|---|---|---|
| Backlog Refinement | Tickets schärfen, Akzeptanzkriterien erzeugen | Product Owner |
| Solution Design | technische Umsetzungsoptionen vorschlagen | Tech Lead |
| Implementation | Codeänderung vorbereiten oder PR erzeugen | Developer |
| Code Review | PR prüfen, Risiken markieren | Senior Developer |
| Test Generation | Testfälle und Testdaten vorschlagen | QA |
| Documentation | Confluence-/README-Updates erzeugen | PO/Dev |
| Release Notes | Release Notes und Stakeholder Summary erzeugen | Release Manager |
| Deployment Readiness | Checks für Release-Freigabe | Engineering Manager |

## 6.2 UI für Module

Ein linker Bereich oder Top-Navigation kann aktivierte Module zeigen:

```text
Modules
[x] Refinement
[x] Implementation
[x] Code Review
[ ] QA
[ ] Release Notes
[ ] Deployment
```

Für die Demo kann ein Toggle zeigen, dass nur Refinement aktiv ist. Das unterstützt die Positionierung als Boilerplate/Startpunkt für Consulting-Projekte.

---

## 7. Integrationsdarstellung im UI

Auch wenn Integrationen zunächst gemockt sind, sollten sie sichtbar sein.

### Integration Panel

```text
Connected Systems

Jira              Connected
Confluence        Connected
GitHub            Mocked
Slack             Mocked
CI/CD             Not configured
Security Scanner  Not configured
```

### Kontextquellen im Drawer

Der Agent Output sollte immer referenzieren, woher Kontext angeblich stammt:

```text
Context used:
- Jira DP-142
- Confluence: ETA Product Requirements
- GitHub: tracking-service/src/eta/*
- Incident: ETA delay spike, March 2026
```

Das hilft Enterprise-Kunden, den späteren Integrationsbedarf zu verstehen.

---

## 8. Demo-Scope

## 8.1 Minimal Demo

Ziel: in wenigen Minuten verständlich machen, was das Produkt sein könnte.

Features:

- statisches Kanban-Board
- ein festes Ticket
- Button „Run Agent“
- simulierter Ladezustand
- generierter Agent Output
- Ticket wechselt in Review
- Approve/Request Changes
- Audit-Trail wird aktualisiert

Keine echten Integrationen, keine echte KI, keine Authentifizierung.

## 8.2 Erweiterte Demo

Features:

- mehrere Module
- mehrere Tickets
- einfache lokale Persistenz
- Demo-Integrationen als Fake Connector Cards
- Review-Kommentare
- Iterationszähler
- Risiko-/Confidence-Anzeige
- Export eines Agent Outputs als Markdown

## 8.3 Pilotfähiger MVP

Features:

- echte Jira-Integration
- echte Confluence-Leserechte
- Git-Repository-Read-Zugriff
- SSO
- Rollen/Rechte
- Audit Log
- konfigurierbare Module
- LLM-Orchestrierung
- Prompt-/Policy-Konfiguration
- Kundenspezifische Guardrails

---

## 9. Informationsarchitektur

Empfohlene Hauptbereiche:

1. **Board**
   - tägliche operative Arbeit

2. **Modules**
   - aktivierte SDLC-Agenten
   - Konfiguration je Modul

3. **Integrations**
   - Jira, Confluence, Git, CI/CD, Chat, IAM

4. **Policies**
   - Human Gates
   - Auto-Approval-Regeln
   - Risikoklassen
   - Compliance-Vorgaben

5. **Audit**
   - Entscheidungen
   - Agentenaktionen
   - Review-Historie

6. **Analytics**
   - Cycle Time
   - Review Bottlenecks
   - Agent Acceptance Rate
   - Rework Rate
   - Time Saved

Für die erste Demo reicht der Bereich **Board** plus ein sichtbares, aber nicht funktionales **Integrations Panel**.

---

## 10. Demo-Narrativ

Die Demo sollte nicht sagen:

> „Wir automatisieren euren kompletten SDLC.“

Besser:

> „Wir zeigen einen kontrollierten Agentic Workflow für einen SDLC-Schritt. Derselbe Mechanismus lässt sich modular auf Refinement, Code Review, QA und Release ausweiten.“

Der wichtigste Eindruck soll sein:

- sicher
- kontrollierbar
- integrierbar
- enterprise-fähig
- schnell adaptierbar
- kein reines Tool, sondern ein Implementierungs-Framework

---

## 11. UX-Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Demo wirkt wie ein weiteres Jira-Board | Agent Output, Audit Trail und Review-Gates prominent zeigen |
| Vollautomatisierung wirkt bedrohlich | Human Control als Kernprinzip positionieren |
| Integrationsaufwand wirkt zu groß | Modularität und Startpunkt-Ansatz betonen |
| Agenten wirken wie Blackbox | Quellen, Confidence und Risiken anzeigen |
| Review wird Bottleneck | Fast Review UI mit klaren Buttons und Rubrics |
| Enterprise-Kunden fragen nach Governance | Audit, Rechte, Policies und Logs sichtbar machen |

---

## 12. Empfohlene erste Umsetzung

### UI-Seiten

1. `/board`
2. `/integrations`
3. `/modules` optional oder als Side Panel

### Kernkomponenten

- KanbanBoard
- TicketCard
- TicketDrawer
- AgentActivityTimeline
- ReviewActions
- IntegrationStatusPanel
- ModuleTogglePanel
- AuditTrail

### State Machine

```text
BACKLOG
  -> AGENT_REFINING
  -> HUMAN_REVIEW
  -> CHANGES_REQUESTED
  -> AGENT_REFINING
  -> APPROVED
  -> READY_FOR_DEV
```

Für die erste Demo ist diese State Machine ausreichend.

---

## 13. Akzeptanzkriterien für die Demo

Die Demo ist erfolgreich, wenn ein Stakeholder innerhalb von fünf Minuten versteht:

- welches Problem gelöst wird
- welche Rolle Agenten spielen
- wo Menschen eingreifen
- welche Integrationen später nötig sind
- dass einzelne Module separat nutzbar sind
- wie ein Pilotprojekt aussehen könnte

Nicht erforderlich:

- echte KI
- echter Codezugriff
- echte Jira-Synchronisation
- produktionsreife Architektur
