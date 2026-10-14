# Entscheidungslog

Festgehaltene Architektur- und Produktentscheidungen. Neue Entscheidungen werden unten angehängt;
überholte Entscheidungen werden nicht gelöscht, sondern als „ersetzt durch …" markiert.

## D1 — Roadmap-Neuschnitt: echte Implementierung statt Mock-Demo (2026-06-10)

Die Phasen 0/1 der [Feature-Roadmap](feature-roadmap.md) (Clickable Demo, Narrative Prototype)
entfallen ersatzlos. Stattdessen wird direkt eine echte, minimale Plattform in fünf Etappen
gebaut (E1–E5, siehe [Phase-2-Backlog](../tickets/phase-2-backlog.md)). Das Minimum Usable Product:
ein Kanban (zunächst als JSON-API, dann Frontend), über das ein Refinement Agent für ein
Beispiel-Repo echtes Backlog Refinement durchführt. Die Roadmap ab Phase 2 bleibt als
Langfrist-Zielbild gültig.

## D2 — Stack: TypeScript end-to-end (2026-06-10)

Ein Repo, eine Sprache: Node.js-Backend, SQLite als lokale DB, Vite/React-Frontend.
Begründung: schnellste Iteration, geteilte Typen zwischen Backend und Frontend,
keine Infrastruktur-Abhängigkeiten in der MUP-Phase.

## D3 — Kein eigener Orchestrator: Coding Agent als Headless-CLI (2026-06-10)

Der Refinement Agent wird nicht selbst gebaut. Stattdessen wird ein Coding Agent als CLI
headless aufgerufen (erste Wahl: `claude -p` mit JSON-Output). Erst wenn das an Grenzen
stößt, wird ausgetauscht oder nachgebaut. Die CLI-Anbindung wird hinter einer schmalen
Schnittstelle gekapselt, damit der Austausch günstig bleibt.

## D4 — Agent-Runs sind von Anfang an asynchron (2026-06-10)

Refinement-Runs dauern voraussichtlich 1–3 Minuten. Runs werden angestoßen und der Status
wird abgefragt (Polling, später ggf. SSE). Ein synchroner Spike würde ab E3 weggeworfen.

## D5 — Refinement-Output als JSON-Spalte am AgentRun (2026-06-10)

Der strukturierte Refinement-Output (User Story, Akzeptanzkriterien, offene Fragen, Risiken,
betroffene Dateien, Confidence) wird als schema-validierte JSON-Spalte (Zod) am `AgentRun`
gespeichert, nicht als eigene Entität. „Das aktuelle Refinement eines Tickets" ist der Output
des letzten erfolgreichen Runs. Eine eigene Tabelle lohnt erst, wenn Outputs editierbar oder
versioniert vergleichbar werden müssen.

## D6 — Expliziter Ticket-Status, kein Event Sourcing (2026-06-10)

Tickets tragen eine explizite Statusspalte (`backlog | refining | review | ready | failed`).
Die Historie wird über append-only `AuditEvent`s abgebildet. Den Status aus Events abzuleiten
wäre für diese Projektgröße Overengineering.

## D7 — ReviewDecision als eigene Entität (2026-06-10)

Review-Entscheidungen (Approve / Request Changes inkl. Feedback) sind eine eigene Entität
und nicht nur ein AuditEvent, weil das Feedback funktionaler Input für den nächsten
Agent-Run ist, nicht nur Historie.

## D8 — Ziel-Repo als Konfiguration, keine Project-Entität (2026-06-10)

Das Ziel-Repo (zunächst [qvest-digital/coffee-chat](https://github.com/qvest-digital/coffee-chat))
wird bis einschließlich E5 als Konfiguration (env/Datei) geführt, nicht als DB-Entität.
Eine `Project`-Tabelle entsteht erst, wenn mehrere Repos/Projekte real gebraucht werden.

## D9 — Kein „Edit & Approve" im MUP (2026-06-10)

Reviewer können den Agent-Output im MUP nicht direkt editieren. „Request Changes" mit
strukturiertem Feedback deckt den Fall ab. Direktes Editieren (inkl. Speichern editierter
Output-Kopien) kommt frühestens nach E4 — das hätte sonst Folgen fürs Datenmodell (siehe D5).

## D10 — Phase 3: Control Plane / Execution Plane trennen (2026-06-25)

Der Phase-2-Monolith (lokales Backend + SQLite + lokale CLI) wird in Phase 3 in zwei Ebenen
aufgetrennt: einen **gehosteten Shared Control Plane** (Datenmodell, Ergebnisse, server-seitige
State Machine + Concurrency, geteilte Registries; Postgres o. Ä.) und einen **Local Execution
Plane** — **pro Nutzer ein Runner**, der Agent-Runs lokal gegen einen lokalen Repo-Checkout
ausführt. Muster: self-hosted CI-Runner / Terraform-Cloud-Agents. Die Phase-2-Invariante
„parallele Refines auf dasselbe Ticket ablehnen" wandert damit server-seitig.
Begründung: Kollaboration (geteilte Ergebnisse/Definitionen) bei gleichzeitig lokaler Ausführung
unter Nutzer-Credentials; hält den Steuerlayer secret-frei (siehe D11).

## D11 — Credential-Modell Phase 3: voll BYO lokal, Control Plane secret-frei (2026-06-25)

LLM-Sub und Tokens für externe Systeme bleiben **lokal beim Nutzer** (Eingabe über die GUI,
Speicherung am Runner). Der Control Plane brokert keine Secrets. Folge: kein eigenes
Enterprise-IAM nötig, externe Aktionen laufen als „acts-as-user". Der gewählte Pro-Nutzer-Runner
(D10) erzeugt Setup-Aufwand; dieser wird über **Packaging** gelöst (ein Befehl: `npx`/Install-Skript,
der auf ein Repo zeigt; Rest in der GUI), nicht über die Topologie — frictionless Onboarding ist
Kern-Deliverable der Phase. Alternativen (zentraler Broker) verworfen, weil sie das zentrale
Secret-Management zurückbringen, das vermieden werden soll.

## D12 — Externe Integrationen: flexible Zugriffsadapter, MCP optional (2026-06-25)

Externe Systeme werden über eine **Integrations-Registry mit austauschbaren Zugriffsadaptern**
angebunden — **direkter API-Call**, **MCP-Server** oder **CLI-Tool**. MCP ist *eine* Option, nicht
Pflicht (z. B. Jira braucht für wenige Tickets keinen MCP-Server). Zentral kuratiert wird, welche
Integrationen + Scopes erlaubt sind; lokale Runner konsumieren die Registry. Jira/Confluence/GitHub
sind damit Instanzen desselben Modells, kein hartcodierter Connector. Ersetzt die frühere Annahme
„Phase 3 = Jira/Confluence-Connector".

## D13 — SSO/OIDC und Enterprise-RBAC nach Phase 5; Phase 3 nur RBAC-lite (2026-06-25)

Da in Phase 3 alles lokal/BYO läuft (D11) und keine zentrale Identität die externen Zugriffe trägt,
wird **SSO/OIDC nicht in Phase 3 gebraucht** und nach Phase 5 verschoben (D14). Phase 3 erhält nur
**RBAC-lite**: Rolle **Kurator/Admin** (darf Skill-/Agent-/Integrations-Registry editieren und
freigeben) vs. **Member** (refined, reviewed), plus leichtgewichtige Identität zur Audit-Attribution.
Volles Enterprise-RBAC, Multi-Tenant, Playbook-Studio, Evaluation- und Policy-Engine bleiben Phase 5.

## D14 — Phase 4 = Modul-Expansion, Plattform-/Enterprise-Ausbau → Phase 5 (2026-06-25)

Die frühere „Phase 4: Multi-Module Enterprise Platform" wird in zwei Phasen geteilt:
**Phase 4** deckt ausschließlich die **Ausweitung auf weitere SDLC-Schritte** ab (Code Review,
Test Generation, Release Notes, Docs, …) — jedes Modul wiederverwendet die bestehende
Infrastruktur (Runner, Registries, Integrations-Adapter aus D10/D12) und erfordert in der Regel
keinen Plattformumbau. **Phase 5** bündelt den **Enterprise-/Plattform-Ausbau** (Workflow Builder,
Policy Engine, Studio-UI, Evaluation-Layer, Multi-Tenant, Environments, Data-Boundary/Retention,
SSO/OIDC + volles Enterprise-RBAC). Begründung: Mehr SDLC-Abdeckung liefert frühen, sichtbaren
Nutzen ohne die schwere Governance-Maschinerie; diese lohnt erst beim breiten Enterprise-Rollout.
Verschiebt die in D13 genannten „bleiben Phase 4"-Punkte auf Phase 5.

## D15 — Phase-3-Topologie: Runner serviert das GUI lokal, Datenhaltung remote (2026-06-25)

> **Ersetzt durch [D17]** — es gibt keine separate „Runner"-Komponente mehr; die gesamte lokale App
> (inkl. GUI) läuft pro Nutzer, nur die DB ist geteilt.

Konkretisiert den Control/Execution-Split (D10): Das vollständige Board-GUI wird vom **lokalen Runner**
serviert; alle Board-Daten und Registries liegen **remote** im Control Plane (Postgres), der secret-frei
bleibt (D11). Jeder Nutzer betreibt also einen lokalen Runner (D10) inkl. GUI; geteilt ist die zentrale
Datenhaltung, nicht das Rendering. Begründung: erfüllt „Control Plane secret-frei" am saubersten, weil
Secrets ohnehin nur lokal am Runner liegen und so direkt am Ort der GUI eingegeben werden. Verworfen
wurde die rein gehostete Web-App, weil das lokale Halten der Secrets dann eine zweite (localhost-)GUI
nur für Tokens erzwungen hätte — zwei UIs statt einer.

## D16 — Runner↔Control-Plane via Pull/Claim, outbound (2026-06-25)

> **Ersetzt durch [D17]** — ohne separaten Runner und ohne gehosteten Anwendungs-Server gibt es kein
> Dispatch-Protokoll; der Run läuft in-process im lokalen Backend des auslösenden Nutzers.

Der Runner **pollt** den Control Plane und **claimt** Runs atomar (Muster: self-hosted CI-Runner), statt
dass der Control Plane Arbeit an den Runner pusht. Begründung: kein eingehender Port am Nutzer-Rechner
nötig (NAT-/Firewall-tauglich), Runs sind ohnehin asynchron (D4), und das server-seitige atomare Claim
erzwingt die Concurrency-Invariante („kein paralleles Refine pro Ticket") auf natürliche Weise. Push
verworfen (offene Ports/Tunnel am Endnutzer-Rechner nötig).

## D17 — Phase-3-Topologie vereinfacht: nur die DB ist geteilt (2026-06-25)

Ersetzt D15 und D16, präzisiert D10/D11/D13. Statt eines gehosteten Control-Plane-Anwendungsservers mit
separatem Runner ist in Phase 3 **nur die Datenbank geteilt** (remote Postgres); **Frontend, Backend und
Agent-Ausführung laufen lokal pro Nutzer** als der an die geteilte DB angebundene Phase-2-Monolith. Damit
entfallen die gehostete API, das Runner↔Server-Pull/Claim-Protokoll und das Runner-Pairing; ein Refine
läuft in-process im lokalen Backend des auslösenden Nutzers (acts-as-user), kein Dispatch.

Enforcement: harte Invarianten werden als **DB-Constraints** erzwungen (z. B. partieller Unique-Index für
„kein paralleles Refine pro Ticket", append-only Audit); **RBAC-lite und Business-Regeln sind
clientseitig** (vertrauenswürdiges Team) — keine harte Sicherheitsgrenze; volle Durchsetzung erst Phase 5.

Bewusst akzeptierte Trade-offs: die DB-Zugangsdaten liegen auf jedem Client, und die geteilte DB ist die
Vertrauensgrenze. Für ein vertrauenswürdiges Pilotteam vertretbar; sauberes Per-User-Sperren/Least-
Privilege und eine echte Autoritäts-Schicht sind Phase-5-Themen (D14). Die geteilte DB bleibt
**secret-frei** (D11): LLM-/externe Tokens liegen ausschließlich lokal.

## D18 — Diagramm-Notation: ASCII konsistent über alle Docs (2026-06-26)

Die [Architektur-Dokumentation](architecture.md) nutzt **ASCII-Diagramme** in `text`-Blöcken — wie
[datenmodell.md](datenmodell.md). Mermaid wurde trotz nativer GitHub-Darstellung **verworfen**, um eine
einzige, editor-unabhängige Notation über alle Dokumente zu halten, ohne Renderer-/Toolchain-Abhängigkeit.
Eigentum: `architecture.md` ownt Topologie, Datenfluss, Vertrauens-/Enforcement-Verortung und Sequenzen
(ASCII); `datenmodell.md` ownt Entitäten, ER-Überblick und State-Machine (ASCII). So bleibt jede Notation
dort, wo sie am stärksten ist, und nichts wird dupliziert.
