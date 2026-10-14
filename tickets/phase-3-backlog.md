# Phase 3 — Implementierungs-Backlog

Setzt **Phase 3** der [Feature-Roadmap](../docs/feature-roadmap.md) um (geteilte DB + lokale App,
[D17](../docs/decisions.md); Topologie siehe [architecture.md](../docs/architecture.md)).
Voraussetzung: [Phase-2-Backlog](phase-2-backlog.md) abgeschlossen.

Architektur in einem Satz: **Die einzige geteilte Komponente ist eine remote Postgres** (alle
Board-Daten + Registries, secret-frei); **alles andere läuft lokal pro Nutzer** — Frontend, Backend
und Agent-Ausführung als an die geteilte DB angebundener Phase-2-Monolith ([D17](../docs/decisions.md)).
Harte Invarianten werden als DB-Constraints erzwungen; RBAC-lite und Business-Regeln sind clientseitig
(vertrauenswürdiges Team; harte Durchsetzung erst Phase 5).

Stand: 2026-06-25. Architektur gemäß [D10–D17](../docs/decisions.md); Datenmodell-Erweiterungen siehe
[docs/datenmodell.md](../docs/datenmodell.md). Tickets werden top-down abgearbeitet; jede Etappe liefert
etwas produktiv Einsetzbares.

Status-Legende: `[ ]` offen · `[~]` in Arbeit · `[x]` fertig

---

## E1 — Geteilte Datenhaltung + lokale App: ein geteiltes Board

Ziel: Mehrere Nutzer betreiben je eine lokale App gegen eine geteilte remote Postgres und sehen dasselbe
Board; ein Refine läuft lokal und landet zentral.

### [ ] T-1: Geteilte remote Postgres — Schema + Migration des Phase-2-Datenmodells

Das Phase-2-Datenmodell (`Ticket`, `AgentRun` mit jsonb-Output [D5](../docs/decisions.md),
`ReviewDecision` [D7](../docs/decisions.md), `AuditEvent` append-only [D6](../docs/decisions.md)) von
lokaler SQLite auf eine geteilte, remote erreichbare Postgres überführen; Migrationsmechanismus und
Provisioning (Dev: Container).

**Akzeptanzkriterien:**
- Eine remote erreichbare Postgres ist provisionierbar; das Schema wird per Migration angelegt; Migrationen laufen unter einem Lock (z. B. Postgres advisory lock) genau einmal und forward-only — parallele Migrationsläufe mehrerer Clients sind ausgeschlossen; ein erneuter Lauf ist idempotent.
- Alle vier Phase-2-Entitäten sind abgebildet; `output` bleibt jsonb und wird via Zod validiert ([D5](../docs/decisions.md)); Ticket-Status bleibt explizite Enum-Spalte ([D6](../docs/decisions.md)).
- Die DB enthält keine Spalten/Tabellen für LLM-/externe Tokens (secret-frei, [D11](../docs/decisions.md), [D17](../docs/decisions.md)).
- Ein realistischer Phase-2-Bestand (mehrere Tickets mit Runs/Reviews/Audit/JSON-Outputs) wird verlustfrei migriert; Zeilenzahl je Tabelle identisch; für eine Stichprobe von Runs ist der `output`-jsonb nach kanonischer Serialisierung hash-gleich zur Quelle (kein Feldverlust, Zod-Revalidierung grün).

### [ ] T-2: Lokale App an die geteilte DB anbinden

Der Phase-2-Monolith (Vite/React-Frontend + Node-Backend + CLI-Wrapper) läuft unverändert lokal, nutzt
aber statt lokaler SQLite die geteilte remote Postgres über eine Connection-Konfiguration
([D2](../docs/decisions.md), [D17](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Die lokale App liest/schreibt ausschließlich gegen die konfigurierte remote Postgres; mehrere Instanzen teilen denselben Datenstand.
- Die DB-Connection-Zugangsdaten werden lokal mit demselben Schutz wie LLM-/externe Tokens gespeichert (OS-Keychain bzw. Datei `0600`, in Logs maskiert, nie im Repo/Projektverzeichnis); Secrets (LLM/extern) bleiben lokal und landen nie in der DB ([D11](../docs/decisions.md)).
- Klarstellung: „secret-frei" meint, dass die DB keine LLM-/externen Tokens speichert — **nicht**, dass ihr eigener Zugang offen ist; der DB-Zugang ist ein zu schützendes lokales Geheimnis.
- `packages/shared` bleibt die einzige Typquelle (kein dupliziertes Interface); `tsc --noEmit` ist grün.

### [ ] T-3: Leichtgewichtige Identität + Rolle

Datenmodell-Delta: `User` (id, name, email, role=`kurator|member`). Die lokale App kennt „wer bin ich"
über lokale Konfiguration (Auswahl/Anlage eines Users) — nur zur Audit-Attribution und für RBAC-lite,
kein Login/SSO ([D13](../docs/decisions.md), [D17](../docs/decisions.md)).

**Akzeptanzkriterien:**
- `User`-Entität existiert; die lokale App ist genau einem User zugeordnet (Default-Rolle `member`).
- Aktionen (Refine, Review, Registry-Änderung) werden im Audit dem aktuellen User zugeordnet.
- Kein SSO/OIDC, keine Passwortlogik, kein Multi-Tenant (Phase-5-Grenze, [D14](../docs/decisions.md)).

### [ ] T-4: Geteiltes Board + Concurrency-Invariante in der DB

Das lokal servierte Board (Daten aus der geteilten DB) zeigt allen Nutzern denselben Stand; die
Phase-2-State-Machine und die Invariante „kein paralleles Refine pro Ticket" werden in der DB erzwungen;
jede Mutation erzeugt ein AuditEvent ([D6](../docs/decisions.md), [D17](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Zwei Nutzer sehen über ihre je lokale App dasselbe Board (Spalten `backlog/refining/review/ready`, `failed` als Badge — Phase-2-Verhalten); Änderungen des einen erscheinen beim anderen (Polling ≤ 5 s).
- Die Statusübergänge folgen der Phase-2-State-Machine; ihre Gültigkeit wird **clientseitig** geprüft (keine harte Grenze — wie RBAC-lite, [D17](../docs/decisions.md)). **Hart** in der DB erzwungen sind die Concurrency-Invariante (nächster Punkt) und der append-only Audit (T-7).
- „Kein paralleles Refine pro Ticket" wird per DB-Constraint erzwungen (partieller Unique-Index auf `ticket_id WHERE status IN (running)`); ein zweiter Anstoß während eines aktiven Runs liefert einen klaren Fehler — auch von einem anderen Nutzer.
- Jede Mutation erzeugt ein AuditEvent.

### [ ] T-5: Lokale Ausführung schreibt zentral + Stale-Run-Handling

Ein Refine läuft lokal in-process im Backend des auslösenden Nutzers (wie Phase 2), gegen einen lokalen
Repo-Checkout unter den lokalen Credentials (acts-as-user); Output/Metadaten landen in der geteilten DB.
Abgestürzte Clients hinterlassen keine dauerhaft hängenden Runs ([D3](../docs/decisions.md),
[D4](../docs/decisions.md), [D11](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Ein Refine eines Tickets läuft lokal und persistiert schema-validierten Output + Metadaten (Modell, Dauer, Kosten/Tokens) in der DB; Ticket → `review`; das Ergebnis ist für alle Nutzer sichtbar.
- Timeout/CLI-Fehler → getypter Fehler, Ticket → `failed`; Repo-Checkout und Credentials bleiben lokal, nichts davon erreicht die DB ([D11](../docs/decisions.md)).
- Ein Run trägt eine Lease (Heartbeat/Ablaufzeit); ein `running`-Run mit abgelaufener Lease (Client abgestürzt) wird als stale erkannt — lazy beim Board-Laden bzw. beim nächsten Refine-Versuch, kein zentraler Daemon nötig —, gibt das Ticket frei und ist erneut anstoßbar; kein Ticket hängt dauerhaft in `refining`.
- Reclaim (stale-Run abschließen + Ticket freigeben) läuft atomar gegen den partiellen Unique-Index; ein nur pausierter (nicht abgestürzter) Client kann einen bereits reclaimten Run nicht mehr fortschreiben (Lease-Fencing/Versionsprüfung beim finalen Output-Write); die Lease-TTL ist deutlich größer als das Heartbeat-Intervall.

---

## E2 — Verteilte Review-Schleife & Multi-Actor-Audit

Ziel: Das Team reviewt zentral, Rework läuft lokal beim jeweiligen Nutzer, der Audit zeigt wer was tat,
und der Fortschritt eines Runs ist auch für andere sichtbar.

### [ ] T-6: Verteilte Review-Schleife

Review-Aktion: `approve|request_changes` + Feedback ([D7](../docs/decisions.md)): approve → `ready`;
request_changes → `refining` mit Rework-Run (Feedback + vorheriger Output als Input), der lokal beim
Nutzer läuft; Buttons im Drawer.

**Akzeptanzkriterien:**
- Review nur im Status `review`; request_changes ohne Feedback wird abgelehnt; kein Edit&Approve ([D9](../docs/decisions.md)).
- request_changes erzeugt einen Rework-Run (`trigger=rework`); `iteration` zählt hoch; jede Entscheidung wird als ReviewDecision ([D7](../docs/decisions.md)) + AuditEvent persistiert.
- Die komplette Schleife refine → review → request changes → rework → approve ist aus dem Board durchspielbar; die Ergebnisse erscheinen für alle Nutzer zentral.
- Die Review-Status- und Feedback-Regeln sind **clientseitig** durchgesetzt (keine harte Grenze, [D17](../docs/decisions.md)); hart bleiben nur die DB-Constraints (Concurrency, append-only Audit). Volle Durchsetzung Phase 5.

### [ ] T-7: Multi-Actor-Audit-Trail

`AuditEvent` zeigt Akteur (User/Rolle) und Zeitpunkt jedes Schritts; Trail im Drawer; Feld für „berührtes
externes System" vorbereitet (befüllt in E3); append-only ([D6](../docs/decisions.md)).

**Akzeptanzkriterien:**
- `AgentRun` referenziert den ausführenden User; `ReviewDecision` den entscheidenden User; `AuditEvent` trägt Akteur; der Trail ist append-only **per DB erzwungen** (Trigger lehnt UPDATE/DELETE auf `audit_event` ab bzw. restriktive DB-Rolle ohne UPDATE/DELETE); ein direkter UPDATE/DELETE-Versuch schlägt fehl.
- Der Audit-Trail eines Tickets zeigt für jeden Schritt Akteur und Zeitpunkt, lesbar für alle Nutzer.
- Das Schema kann ein berührtes externes System referenzieren (in E3 befüllt).

### [ ] T-8: Fortschritt anderer Nutzer sichtbar

Die Fortschritts-Events des lokalen Runs werden in die geteilte DB persistiert; die eigene UI zeigt sie
live (in-process wie Phase 2), andere Nutzer sehen sie per Polling ([D4](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Während eines Runs sind die Agent-Schritte in der UI des ausführenden Nutzers live sichtbar und für andere Nutzer per Polling nachvollziehbar.
- Abgeschlossene Runs zeigen das vollständige Schritt-Protokoll aus den in der DB gespeicherten Events; wiederholt gelieferte Events erzeugen keine Duplikate.

---

## E3 — Erste externe Integration: lokaler Secret-Store + Integrations-Registry + Jira-Adapter

Ziel: Ein Agent-Run liest/schreibt ein reales externes System (Jira) unter den lokalen Tokens des
Nutzers, zentral kuratiert über austauschbare Adapter und im Audit nachvollziehbar.

### [ ] T-9: Lokaler Credential-Store + Secret-GUI

Die lokale App erhält eine Ansicht zur Eingabe und abgesicherten lokalen Speicherung von LLM-Sub,
externen Tokens, Repo-Pfad und Modell — die einzige Stelle, an der Secrets eingegeben werden
([D11](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Tokens/Modell/Repo werden in der lokalen App gesetzt und ausschließlich lokal persistiert (Neustart behält sie), nie in die geteilte DB geschrieben.
- Secrets liegen verschlüsselt bzw. im OS-Keychain mit Datei-Permissions `0600`, nie im Repo/Projektverzeichnis; in GUI und Logs maskiert.
- Ein DB-/Netz-Mitschnitt eines vollständigen Refine+Jira-Runs enthält nachweislich kein LLM-/externes Token.

### [ ] T-10: Integration-Entität + Adapter-Abstraktion (api|mcp|cli)

Datenmodell-Delta: `Integration` (id, name, adapter_type=`api|mcp|cli`, config, scopes) zentral; eine
schmale, austauschbare Adapter-Schnittstelle in der lokalen App kapselt die Zugriffsart. MCP ist eine
vorgesehene, in Phase 3 **nicht gebaute** Option ([D12](../docs/decisions.md)).

**Akzeptanzkriterien:**
- `Integration`-Entität existiert; die DB speichert nur Konfiguration + erlaubte Scopes, keine Tokens ([D11](../docs/decisions.md)).
- Eine gemeinsame Adapter-Schnittstelle kapselt die Zugriffsarten; der Aufrufer kennt nur die Schnittstelle. Sie ist so geschnitten, dass ein MCP-Adapter später ohne Schnittstellenänderung andockbar wäre.
- In Phase 3 wird kein MCP-Adapter implementiert (nur `api`, optional `cli`); das System funktioniert vollständig ohne jeden MCP-Server ([D12](../docs/decisions.md)).

### [ ] T-11: Zentral kuratierte Registry, lokal konsumiert

Die geteilte DB hält, welche Integrationen + Scopes erlaubt sind (kuratiert); die lokale App konsumiert
die Registry und instanziiert die Adapter mit den lokal gespeicherten Tokens ([D11](../docs/decisions.md),
[D12](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Die App liest die zentral freigegebenen Integrationen + Scopes und zeigt, für welche ein Token hinterlegt ist; kombiniert wird zentrale Scope mit lokalem Token.
- Eine zentral entfernte/gesperrte Integration ist nach erneutem Laden nicht mehr nutzbar; eine nicht geführte Integration kann die App nicht verwenden.
- Ein Test belegt, dass kein externes Token die geteilte DB erreicht.

### [ ] T-12: Jira-API-Adapter end-to-end + Audit

Konkreter API-Adapter für Jira (Ticket lesen, optional kommentieren) als erste vertikale Integration; die
lokale App ruft Jira mit dem lokalen Token des Nutzers auf (acts-as-user); jeder externe Aufruf wird
auditiert ([D11](../docs/decisions.md), [D12](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Ein Run kann über den Jira-Adapter ein reales Jira-Ticket lesen und dessen Inhalt als Eingabekontext nutzen — ohne Plattform-Code-Änderung, nur über die Registry verdrahtet (die Austauschbarkeit des Adapter-Vertrags ist in T-10 belegt).
- Der Aufruf läuft unter dem lokalen Nutzer-Token; nur in der Registry freigegebene Scopes werden genutzt (Erzwingung lokal vor dem API-Call, da die DB das Token nicht sieht); ein nicht freigegebener Scope wird abgelehnt.
- Jeder externe Zugriff erzeugt ein AuditEvent mit Akteur, Integration, Aktion, Scope, Zeitpunkt; er erscheint korrekt attribuiert im zentralen Audit-Trail.

---

## E4 — Geteilte Skill-/Agent-Registries + RBAC-lite

Ziel: Ein Kurator definiert zentral Skills und Agent-Definitionen, die alle lokalen Apps konsumieren;
Kuratoren editieren Registries, Member konsumieren sie.

### [ ] T-13: Skill- + AgentDefinition-Entitäten, lokal konsumiert

Datenmodell-Delta: `Skill` und `AgentDefinition` zentral in der DB; eine AgentDefinition referenziert
Skills und erlaubte Integrationen. Die lokale App lädt die zentrale Definition und verdrahtet den Run
entsprechend.

**Akzeptanzkriterien:**
- `Skill`- und `AgentDefinition`-Entitäten existieren und sind les-/anlegbar; die bestehende Refinement-Funktionalität ist als Default-AgentDefinition abgebildet (kein Funktionsverlust).
- Ein Run nutzt die zentral definierte AgentDefinition (Skills + erlaubte Integrationen) statt lokal hartkodierter Prompts; alle Apps laden dieselbe Definitions-Version.
- Die am Run dokumentierte Definition-ID/Version stimmt mit der zentralen überein (am AgentRun-Input und im Audit nachvollziehbar).

### [ ] T-14: RBAC-lite (clientseitig) + Registry-Verwaltung im Board

Das Board erhält Ansichten zum Lesen und (für Kuratoren) Bearbeiten von Skill-, Agent- und
Integrations-Registry; Member sehen sie read-only. Die Durchsetzung ist clientseitig — bewusste
Phase-3-Grenze ([D13](../docs/decisions.md), [D17](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Skills, Agent-Definitionen und Integrationen sind im Board les-/einsehbar; die eigene Rolle ist erkennbar; Bearbeiten/Freigeben ist nur für Kuratoren sichtbar.
- Registry-Änderungen erzeugen AuditEvents mit Akteur.
- Die Durchsetzung ist ausdrücklich clientseitig und keine harte Sicherheitsgrenze; harte Invarianten (Concurrency, append-only Audit) bleiben DB-seitig; volle Rechte-Durchsetzung ist Phase 5 ([D14](../docs/decisions.md)).

---

## E5 — Mehrere Projekte, Onboarding & Härtung

Ziel: Das Team fährt Tickets gegen mehrere Repos; ein Nicht-Techie bringt mit einem Befehl die lokale App
ans Laufen; der Betrieb ist version- und fehlerrobust, alle Phase-3-Muss-Kriterien sind nachgewiesen.

### [ ] T-15: Project-Entität + Board-Filter

Das in Phase 2 als Konfiguration geführte Ziel-Repo wird zur `Project`-Entität (id, name, repo_url);
Tickets gehören zu einem Project, die lokale App checkt das jeweilige Project-Repo aus; das Board ist nach
Project filterbar ([D8](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Mehrere Projects mit eigenen `repo_url`s sind anlegbar; ein Ticket referenziert genau ein Project; die App checkt für einen Run das Project-Repo lokal aus.
- Migration: das bisher konfigurierte Repo wird als initiales Default-Project übernommen, bestehende Tickets verlustfrei zugeordnet ([D8](../docs/decisions.md)).
- Das Board lässt sich auf ein Project filtern; Karten zeigen ihr Project, wenn ungefiltert; die Project-Auswahl ist beim Anlegen eines Tickets verfügbar.

### [ ] T-16: Ein-Befehl-Setup der lokalen App

Kern-Deliverable: ein Befehl (`npx`/Install-Skript) bringt auf einer frischen Maschine die lokale App
(Board + Backend + Secret-GUI) ans Laufen und bindet sie via Invite/Config an die geteilte DB; geführte
GUI-Konfiguration + Self-Check, sodass auch ein Nicht-Techie (PO/PM) es schafft ([D11](../docs/decisions.md),
[D17](../docs/decisions.md)).

**Akzeptanzkriterien:**
- Ein einziger dokumentierter Befehl startet ohne manuelle Build-/Config-Datei-Schritte die lokale App und zeigt die localhost-Board-URL; Vorbedingungen sind explizit (z. B. Node-Version) bzw. self-contained.
- Ein Invite/Config trägt die DB-Anbindung; Tokens/Repo/Modell werden komplett über die GUI gesetzt (kein Datei-Editieren), pro Schritt grün/rot mit verständlichem Hinweis; ungültige Eingaben blockieren den Run statt stillem Fehlschlag.
- Ein nicht-technischer Tester bringt mit einem Befehl + GUI die App zum Laufen und startet einen Refinement-Run (dokumentierter Durchstich, 0 Config-Datei-Edits).

### [ ] T-17: App-Versionierung gegen das geteilte Schema

Mehrere lokale Apps unterschiedlicher Version teilen ein Schema; daher Kompatibilitäts-Check beim Start
und ein Ein-Befehl-Update.

**Akzeptanzkriterien:**
- Die App prüft beim Start die Schema-/Kompatibilitätsversion der geteilten DB (inkl. AgentDefinition-Schema-Version, T-13); eine inkompatible App-Version verweigert den Betrieb mit klarer Meldung — so bleiben nach einer Schema-Migration noch nicht aktualisierte Clients sauber außen vor, statt korrupt zu schreiben.
- Es gibt einen dokumentierten, manuellen Ein-Befehl-Update-Pfad. (Optionales Nice-to-have: GUI-Hinweis „Update verfügbar".)

### [ ] T-18: Verteilte Fehlerzustände + Phase-3-Abschluss-Akzeptanz

Verbindungs-/Fehlerzustände (DB nicht erreichbar, stale runs, CLI-/Integrations-Fehler) werden im Board
verständlich dargestellt, inkl. Retry; abschließender end-to-end-Durchstich gegen alle
Phase-3-Akzeptanzkriterien der Roadmap.

**Akzeptanzkriterien:**
- DB-Nichterreichbarkeit, stale runs (T-5), CLI-/Integrations-Fehler haben je eine verständliche Darstellung; Retry startet einen neuen Run mit korrekter Iteration; kein Fehlerzustand führt zu einem dauerhaft hängenden Ticket.
- Checkliste gegen die Phase-3-Akzeptanzkriterien der [Feature-Roadmap](../docs/feature-roadmap.md): mehrere Nutzer teilen Board/Ergebnisse/Skills/Agent-Definitionen über die geteilte DB; Ein-Befehl-Setup für Nicht-Techies; lokale acts-as-user-Runs bei secret-freier DB; mindestens eine Integration als API-Adapter über die Registry ohne Plattform-Code-Änderung (MCP optional, kein Gate); kollisionsfreie parallele Runs; Audit zeigt Akteur und berührte externe Systeme.
- Die komplette Multi-User-Schleife (zwei Nutzer, eine externe Integration) ist im zentralen Audit lückenlos nachvollziehbar.
