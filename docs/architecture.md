# Architektur

Stand: 2026-06-26. Dieses Dokument zeigt, **wie die Plattform physisch läuft** — Laufzeit-/Deployment-
Topologie, Datenfluss, Vertrauensgrenze und die Verortung der Durchsetzung (Enforcement) — und wie sich
das über die Phasen wandelt. Diagramme sind ASCII (konsistent zu [datenmodell.md](datenmodell.md),
Konvention [D18](decisions.md)).

---

## 0. Das Bild in 60 Sekunden

```text
            +-------------------------------------------------------+
            |  GETEILT  (Vertrauensgrenze)                          |
            |    +-----------------------------------------------+  |
            |    |  Remote Postgres   --   secret-frei           |  |
            |    |  Board . Runs . Reviews . Audit .             |  |
            |    |  Registries (Skills / Agents / Integrationen) |  |
            |    +-----------------------------------------------+  |
            +----------------^------------------------^-------------+
                             |   nur Daten,           |
                             |   keine Secrets        |
              +--------------+                        +-------------+
              |                                                     |
   +----------+-------------------+          +----------------------+----------+
   |  LOKAL  --  Nutzer A         |          |  LOKAL  --  Nutzer B            |
   |    App: Frontend + Backend   |          |    App: Frontend + Backend     |
   |         + Agent-Run          |          |         + Agent-Run            |
   |    Secrets  (nur lokal)      |          |    Secrets  (nur lokal)        |
   |    Repo-Checkout (lokal)     |          |    Repo-Checkout (lokal)       |
   +------------------------------+          +--------------------------------+
```

*Abb. 0 — Phase-3-Topologie, reduziert. Die einzige geteilte Komponente ist eine remote Postgres; alles
andere läuft lokal pro Nutzer ([D17](decisions.md)).*

**Vier Merksätze:**

1. **Was läuft wo?** Frontend, Backend und der Agent-Run laufen **lokal** auf dem Rechner jedes Nutzers.
   Geteilt ist **nur die Datenbank**.
2. **Was ist geteilt?** Board, Ergebnisse, Audit und die Registries (Skills, Agent-Definitionen,
   Integrationen) — die geteilte DB ist die gemeinsame Quelle der Wahrheit.
3. **Wo liegen meine Secrets?** LLM-Zugang und externe Tokens bleiben **ausschließlich lokal**. Die
   geteilte DB ist **secret-frei**.
4. **Warum ist das sicher genug?** Harte Invarianten erzwingt die DB selbst; der Rest stützt sich auf ein
   vertrauenswürdiges Team. Die geteilte DB ist die Vertrauensgrenze (Details in §3).

---

## 1. Zweck, Scope & Lesehinweis

**Dieses Dokument besitzt** (alleinige Quelle): die Laufzeit-/Deployment-Topologie je Phase, den
Datenfluss eines Refine, die Vertrauensgrenze und die *Verortung* der Durchsetzung (hart in der DB vs.
weich im Client), die Verhaltens-Sequenzen (Refine, Concurrency, Stale-Reclaim, acts-as-user) und die
Topologie-Evolution über die Phasen.

**Dieses Dokument verlinkt nur** (dupliziert nicht):

| Du suchst … | … dann hier |
|---|---|
| Entitäten, Felder, ER, State-Machine, Output-Schema | [datenmodell.md](datenmodell.md) |
| das *Warum* / die Historie / Trade-offs jeder Entscheidung | [decisions.md](decisions.md) |
| *Was/Wann*, Scope, Module, KPIs, Integrations-Prioritäten | [feature-roadmap.md](feature-roadmap.md) |
| konkrete Tickets, Etappen, Akzeptanzkriterien | [phase-2-backlog](../tickets/phase-2-backlog.md), [phase-3-backlog](../tickets/phase-3-backlog.md) |
| UI-Wireframes / Screen-Skizzen *(älter, mit Mock-Annahmen)* | [ui-ux-concept.md](ui-ux-concept.md) |

> **Faustregel:** *Form/Daten → datenmodell · Warum → decisions · Was/Wann → roadmap · UI → ui-ux ·
> Tickets → backlog · Wie-läuft-es-physisch → hier.*

**Drei Lesepfade:**

- **Nur das Bild:** §0 — reicht für das mentale Modell.
- **Nicht-technisch:** §0 → §3 (Trust) → §4 (Evolution).
- **Ich baue:** §2 (Prinzipien) → §5 (Phase 3) → §8 (Querschnitt) → Backlog.

**Notation:** ASCII-Diagramme in ```text-Blöcken, konsistent zu `datenmodell.md` ([D18](decisions.md)).
Jede Abbildung trägt eine Bildunterschrift mit ihrer `[D..]`-Basis.

---

## 2. Architektur-Prinzipien (phasenstabil)

Diese Leitsätze gelten über **alle** Phasen — der Topologie-Wandel (§4) wirft die Anwendungslogik
**nicht** um, er verschiebt nur, *wo* die Daten liegen und *wo* durchgesetzt wird.

- **TypeScript end-to-end**, `packages/shared` als einzige Quelle der geteilten Typen ([D2](decisions.md)).
- **Kein eigener Orchestrator:** der Coding-Agent ist eine austauschbare Headless-CLI hinter einer
  schmalen Schnittstelle ([D3](decisions.md)).
- **Runs sind asynchron:** anstoßen + Status beobachten (Polling, später SSE) ([D4](decisions.md)).
- **Strukturierter Output**, schema-validiert via Zod ([D5](decisions.md)).
- **Expliziter Status + append-only Audit** statt Event-Sourcing ([D6](decisions.md)).
- **Human-in-the-Loop an Gates:** keine Freigabe ohne Mensch; kein „Edit & Approve" ([D9](decisions.md)).
- **acts-as-user / secret-frei:** externe Aktionen laufen unter den lokalen Credentials des Nutzers; die
  geteilte Datenhaltung hält keine Secrets ([D11](decisions.md), [D17](decisions.md)).

---

## 3. Vertrauens- & Enforcement-Modell

Dieser Abschnitt steht **einmal** zentral, damit das Trust-Modell nicht je Phase wiederholt wird.

**Vertrauensgrenze.** In Phase 3 ist die **geteilte DB** die Vertrauensgrenze ([D17](decisions.md)): Wer
an ihr schreiben darf, gilt als vertrauenswürdig. Es gibt keinen serverseitigen Anwendungs-Layer dazwischen.

**Secret-Topologie.**

```text
   LOKAL pro Nutzer                          GETEILT
   +-------------------------------+         +---------------------------+
   |  LLM-Zugang        (Secret)   |         |  Remote Postgres          |
   |  externe Tokens    (Secret)   |  ====   |  secret-frei:             |
   |  DB-Zugangsdaten   (Secret)*  |  Daten  |  keine LLM-/ext. Tokens   |
   +-------------------------------+         +---------------------------+
        |  Secrets verlassen das Lokale NIE Richtung DB
        v
   externe Systeme (LLM, Jira)   <-- acts-as-user, lokales Token
```

*Abb. 3 — Secrets bleiben lokal; die geteilte DB ist secret-frei ([D11](decisions.md), [D17](decisions.md)).
\*Die DB-Zugangsdaten selbst sind ein **lokal zu schützendes** Geheimnis — „secret-frei" meint die in der
DB gespeicherten LLM-/externen Tokens, nicht den DB-Zugang.*

**Enforcement — Verortung (hart vs. weich).** Dieses Dokument hält fest, *wo* durchgesetzt wird; *wie*
genau (Constraint-Form, Trigger, Rollen) steht in
[datenmodell.md → „Enforcement & Trust"](datenmodell.md#enforcement--trust).

| Regel | Verortung | erzwungen durch |
|---|---|---|
| Kein paralleles Refine pro Ticket | **HART** | DB-Constraint (Mechanik → datenmodell.md) |
| Audit ist append-only | **HART** | DB (Mechanik → datenmodell.md) |
| RBAC-lite (Kurator/Member) | **WEICH** | clientseitig |
| Status-Übergänge der State-Machine | **WEICH** | clientseitig |
| Business-Regeln (z. B. kein Review außerhalb `review`) | **WEICH** | clientseitig |

**Bewusst akzeptierter Trade-off.** Die DB-Zugangsdaten liegen auf jedem Client, und die weichen Regeln
sind keine harte Sicherheitsgrenze — für ein vertrauenswürdiges Team vertretbar. Eine echte
Autoritäts-Schicht (Server + Per-User-Least-Privilege) ist ein Phase-5-Thema ([D14](decisions.md),
[D17](decisions.md), siehe §7).

---

## 4. Topologie-Evolution auf einen Blick

Das meistdiskutierte Thema. Zellen nennen nur das Topologie-Faktum + die treibende Entscheidung; Details
zu Daten/Constraints stehen in `datenmodell.md`, das Warum in `decisions.md`.

| Achse | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|
| Deployment-Einheit | lokale Next.js-App, ein Prozess (D19) | lokale App pro Nutzer | wie P3 | gehosteter Multi-Tenant-Dienst |
| Geteilte Komponente | keine | **nur die DB** (D17) | wie P3 | Server + DB |
| Persistenz | SQLite (lokal) | Postgres (remote, geteilt) | wie P3 | wie P3, mandantenfähig |
| Ausführungsort der Runs | lokal | lokal, in-process (D17) | lokal | lokal/gemischt |
| Vertrauensgrenze | die Maschine | **geteilte DB** (D17) | wie P3 | Server-Autoritäts-Schicht (D14) |
| Secret-Halten | lokal | lokal (D11) | lokal | zentral verwaltbar (D14) |
| AuthN/AuthZ | keine | RBAC-lite, clientseitig (D13) | wie P3 | SSO/OIDC + volles RBAC (D13/D14) |
| Enforcement | App-Logik | hart=DB / weich=Client (D17) | wie P3 | serverseitig autoritativ (D14) |

```text
  P2  lokale App              P3  DB herausgeloest+geteilt    P4  gleich + mehr Module    P5  gehosteter Dienst
  +-------------------+       +----------+    +---------+      +----------+   +-------+     +-----------------+
  | Next.js+Kern+     |  -->  | App lokal| -> |geteilte |  --> | App lokal | ->|geteilte| --> | Server + DB     |
  | CLI+SQLite        |       | (Next.js+|    |  DB     |      | (N Module)|   |  DB    |     | Multi-Tenant    |
  +-------------------+       |  Kern)   |    +---------+      +----------+   +-------+     | SSO/RBAC/Policy |
                             +----------+                                                  +-----------------+
       was bleibt -->  Anwendungslogik (Board, Refine, Review, Audit);  was wandert -->  Persistenz, Vertrauensgrenze, Enforcement
```

*Abb. 4 — Was über die Phasen bleibt vs. wandert ([D10](decisions.md), [D17](decisions.md),
[D14](decisions.md)).*

> **Historische Notiz:** Phase 3 war zwischenzeitlich als *Shared Control Plane + lokaler Runner* geplant
> ([D10](decisions.md), [D15](decisions.md), [D16](decisions.md)). Dieses Modell wurde durch
> [D17](decisions.md) ersetzt — es gibt **keinen** Control-Plane-Server und **keinen** separaten Runner
> mehr. „Control Plane" und „Runner" sind daher **kein** aktuelles Vokabular.

---

## 5. Phase 3 — Geteilte DB + lokale App (Schwerpunkt)

Die aktuelle Zielarchitektur ([D17](decisions.md)).

### 5.1 Deployment-Sicht

```text
   +=========================================================================+
   |  GETEILT (Vertrauensgrenze)                                             |
   |   +-----------------------------------------------------------------+   |
   |   |  Remote Postgres  --  secret-frei                               |   |
   |   |  Board . Runs(+Lease) . Reviews . Audit(append-only)            |   |
   |   |  Registries: Skills / AgentDefinitions / Integrations           |   |
   |   |  HARTE Invarianten in der DB  (Mechanik -> datenmodell.md)      |   |
   |   +-----------------------------------------------------------------+   |
   +=================^===============================^=======================+
                     | nur Daten (keine Secrets)     |
   +-----------------+--------------+   +------------+----------------------+
   |  LOKAL  --  Nutzer A           |   |  LOKAL  --  Nutzer B              |
   |   App: Next.js (UI + Actions)  |   |   App: Next.js (UI + Actions)    |
   |   Kern: packages/core (Hexa.)  |   |   Kern: packages/core (Hexa.)    |
   |   Agent-Run in-process (CLI)   |   |   Agent-Run in-process (CLI)     |
   |   lokaler Secret-Store         |   |   lokaler Secret-Store           |
   |   Repo-Checkout                |   |   Repo-Checkout                  |
   +--------------+-----------------+   +-------------+--------------------+
                  |  acts-as-user (lokales Token)                  |
                  v                                                v
            LLM-Dienst  /  Jira (API)                       LLM-Dienst / Jira (API)
```

*Abb. 5.1 — N lokale Apps gegen EINE geteilte, secret-freie DB. Bewusst **kein** Server, **kein** Runner,
**kein** Dispatch und **kein** `pending`-Status ([D17](decisions.md)).*

### 5.2 Refine end-to-end (acts-as-user, in-process)

```text
  Nutzer A      Lokale App A                 Geteilte DB              LLM / Jira
    |  Refine ----> |                            |                       |
    |               | 1. Run anlegen + Lease --> | [HART: kein           |
    |               |                            |  paralleles Refine]   |
    |               | 2. CLI-Run lokal           |                       |
    |               |    (lokale Creds) ---------(acts-as-user)--------> |
    |               | 3. Heartbeat ------------> | (Lease frisch halten) |
    |               | 4. Output + Audit -------> | Ticket -> review      |
    |  <-- Polling -|                            |                       |
  Nutzer B  <------------- sieht Ergebnis via Polling auf das Board -----|
```

*Abb. 5.2 — Der Run läuft lokal unter den Credentials des Nutzers; nur Daten gehen in die DB
([D3](decisions.md), [D4](decisions.md), [D11](decisions.md), [D17](decisions.md)).*

### 5.3 Multi-User-Concurrency (HART)

```text
  Nutzer A --\                         Geteilte DB
              >-- Refine Ticket T-9 -->  [HART: kein paralleles Refine]
  Nutzer B --/                              |
                                            +--> A: Run startet (gewinnt)
                                            +--> B: klarer Fehler (abgelehnt)
                                          Audit: beide Versuche attribuiert
```

*Abb. 5.3 — Die Concurrency-Invariante ist eine **harte** DB-Garantie, nicht App-Logik. Die
State-Machine-Übergänge selbst bleiben **weich**/clientseitig (§3). Mechanik →
[datenmodell.md](datenmodell.md#enforcement--trust) ([D17](decisions.md)).*

### 5.4 Stale-Run-Reclaim (Lease/Fencing, lazy)

```text
  Client A startet Run, sendet Heartbeat ... stuerzt ab
       |
       |  Lease laeuft ab
       v
  Client B laedt Board (lazy) --> erkennt stale --> reclaimt atomar --> Ticket frei
       |
  Client A (nur pausiert) kehrt zurueck --> Schreiben abgelehnt (Lease-Fencing)
```

*Abb. 5.4 — Aufräumen verwaister Runs ohne Daemon; ein nur pausierter Client kann einen reclaimten Run
nicht überschreiben (→ [phase-3-backlog T-5](../tickets/phase-3-backlog.md)).*

### 5.5 Integrations-Registry & Adapter

```text
   Geteilte DB                         Lokale App
   +---------------------------+       +-------------------------------------+
   | Integration-Eintraege:    |       | Registry-Loader                     |
   |  name, adapter_type,      | ----> |   |                                 |
   |  config, SCOPES           | liest |   v                                 |
   |  (KEINE Tokens)           |       | Adapter-Schnittstelle               |
   +---------------------------+       |   |-- api  (Jira: GEBAUT)           |
                                       |   |-- cli  (optional)               |
                                       |   '-- mcp  (vorgesehen, NICHT gebaut)|
                                       |        + lokales Token              |
                                       +-------------------------------------+
                                              |  Durchsetzung des Scope LOKAL,
                                              |  vor dem Call (Token nie in der DB)
                                              v
                                          externes System (Jira)
```

*Abb. 5.5 — Scopes zentral kuratiert (in der secret-freien DB), **Durchsetzung lokal vor dem Call**, da
das Token die DB nie erreicht. MCP ist andockbar, in Phase 3 nicht gebaut ([D11](decisions.md),
[D12](decisions.md); → [T-11/T-12](../tickets/phase-3-backlog.md)).*

Im Code ist jede Integration ein weiterer **Adapter hinter einem Port** in `packages/core`
([D19](decisions.md)); Use Cases und Domäne bleiben unverändert.

---

## 6. Phase 2 — Lokale Refinement-App (Ist-Bau-Stand)

Alles auf einer Maschine, **ein** Prozess, keine geteilte Komponente ([D19](decisions.md)).

```text
   +=============================== eine Maschine ===============================+
   |  Browser                                                                    |
   |    | RSC-Seiten (lesen)    Server Actions (schreiben)    EventSource (SSE)  |
   |    v                                                                        |
   |  apps/web  --  Next.js 16, ein Node-Prozess (next dev / next start)         |
   |    lib/container.ts = Composition Root (Engine-Singleton auf globalThis)    |
   |    |                                                                        |
   |    v                                                                        |
   |  packages/core  --  Hexagon                                                 |
   |    application (Use Cases)  -->  domain (Regeln, Fehler)                    |
   |    ports:    TicketRepository . AgentRunRepository . AuditLog               |
   |              AgentRunner . RepoProvider . EventPublisher                    |
   |    adapters: sqlite (Drizzle) . git (Repo-Cache) . claudeCli . nodeEvents   |
   |    |               |                   |                                    |
   |    v               v                   v                                    |
   |  SQLite       Repo-Checkout       "claude --print" (D3)                     |
   |  Secrets: lokal (Claude-Login, optional GITHUB_TOKEN)                       |
   +=============================================================================+
```

*Abb. 6 — Phase-2-Topologie ([D2](decisions.md), [D3](decisions.md), [D19](decisions.md); Scope →
[feature-roadmap.md](feature-roadmap.md), Tickets → [phase-2-backlog](../tickets/phase-2-backlog.md)).*

**Schichten.** `apps/web` ist der treibende Adapter: Server Components rufen Use Cases direkt auf,
Server Actions schreiben, `app/api/events/route.ts` streamt Ereignisse. `packages/core` enthält die
Fachlogik; `domain/`, `ports/` und `application/` importieren weder Adapter noch I/O — das prüft eine
ESLint-Regel. `packages/shared` hält die Zod-Verträge (DTOs, Inputs, Events, Agent-Ausgabe), die Kern
und UI teilen.

**Refine-Fluss.** Server Action → Use Case validiert, setzt `refining`, veröffentlicht ein Status-Event
und startet den Lauf im Hintergrund → Repo klonen/aktualisieren → Codebase-Summary → `claude --print`
→ Ergebnis (Rückfrage oder Refinement) → Status/Audit → Events über den `EventPublisher` an die
SSE-Route → Browser aktualisiert Fortschritt und lädt bei Status-/Fragen-Events die Seite neu.

**Grenzen.** Ein dauerhafter Node-Prozess ist Voraussetzung: lang laufende Kindprozesse, Event-Bus im
Speicher, lokale SQLite-Datei — **kein Serverless-Hosting** ([D19](decisions.md)). Die Ticket-State-Machine
gehört [datenmodell.md](datenmodell.md).

**Beispiel-Ziel.** Standard-Demo ist der Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)),
Seed-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

---

## 7. Phase 4 / Phase 5 — Delta & Zielbild

### Phase 4 — Modul-Delta auf gleicher Infrastruktur

Die Topologie bleibt **unverändert** gegenüber Phase 3. Jedes neue SDLC-Modul ist im Kern eine
**AgentDefinition + Skill(s) + Integrationen** über die bestehende Registry — die Plattform wird nicht
umgebaut ([D14](decisions.md)).

```text
   gleiche P3-Topologie  +  mehrere AgentDefinitions:
       Refinement  |  Code Review  |  Test-Gen  |  ...
       -> alle nutzen dieselbe Registry / Adapter / Run-Infrastruktur
```

*Abb. 7a — Phase 4 = mehr Definitionen, kein Plattformumbau ([D14](decisions.md); Module →
[feature-roadmap.md](feature-roadmap.md)).*

### Phase 5 — Enterprise-Zielbild *(tentativ, noch nicht entschieden)*

Der **nächste echte Topologiewechsel**: ein gehosteter Multi-Tenant-Dienst löst die bewusst
akzeptierten Phase-3-Vereinfachungen ab.

```text
   ABGELOEST werden (siehe §3):
     (a) clientseitige (WEICH) Durchsetzung von RBAC/Business-Regeln
     (b) DB-Zugang pro Client / geteilte DB als Vertrauensgrenze
                    |
                    v
   ERSETZT durch:  echte Autoritaets-Schicht
     Server + Per-User-Least-Privilege | SSO/OIDC + volles RBAC
     Policy-Engine | Studio-UI | Evaluation | Multi-Tenant | Environments
```

*Abb. 7b — Phase 5 ersetzt **beide** Phase-3-Vereinfachungen durch eine echte Autoritäts-Schicht
([D14](decisions.md), [D17](decisions.md); Zielbild, Details → [feature-roadmap.md](feature-roadmap.md)).*

---

## 8. Querschnitt & Cheatsheet „was bleibt, was wandert"

**Async-Runs & Progress.** Runs werden angestoßen und beobachtet — erst Polling, später SSE
([D4](decisions.md)). Das Muster bleibt über alle Phasen gleich; nur die Datenquelle wandert von lokal
nach geteilt.

**App- vs. geteiltes Schema (Versionskompatibilität).** Weil mehrere lokale Apps gegen eine geteilte DB
laufen, prüft jede App beim Start ihre Kompatibilität:

```text
   App-Start
      |
      v
   Schema-/Versionscheck gegen geteilte DB
      |--- kompatibel   --> Betrieb
      |--- inkompatibel  --> Verweigerung mit klarer Meldung (kein korruptes Schreiben)
      '--- DB unerreichbar --> klarer Fehler, kein stiller Teilbetrieb
```

*Abb. 8 — Versions-Gate beim App-Start (→ [phase-3-backlog T-17/T-18](../tickets/phase-3-backlog.md)).*

**Was bleibt / was wandert:**

- **bleibt:** Anwendungslogik (Board, Refine, Review, Audit), das async-Run-Modell, Human-in-the-Loop.
- **wandert:** Persistenz (lokal → geteilt), die Concurrency-Invariante (App-Logik → DB-Constraint →
  später Server), AuthZ (keine → RBAC-lite clientseitig → SSO/volles RBAC). Secrets bleiben lokal bis
  Phase 5. Technisch wandern dabei nur **Adapter**: SQLite → Postgres-Repositories, In-Process-Event-Bus
  → prozessübergreifender `EventPublisher` (z. B. Postgres `LISTEN/NOTIFY`); Use Cases und Domäne
  bleiben ([D19](decisions.md)).

---

## 9. Glossar & Verweismatrix (DRY-Vertrag)

**Glossar** (kanonisches Vokabular):

- **Geteilte DB** — die einzige geteilte Komponente in Phase 3; Quelle der Wahrheit und Vertrauensgrenze.
- **Lokale App** — Frontend + Backend + Agent-Ausführung, pro Nutzer auf dessen Rechner.
- **In-process Run** — der Agent-Run läuft im lokalen Backend, ohne Dispatch an einen Dritten.
- **acts-as-user** — externe Aufrufe laufen unter den lokalen Credentials des Nutzers.
- **Lease / Fencing** — Heartbeat-gestützter Mechanismus, der verwaiste Runs freigibt und veraltete
  Schreibzugriffe abweist.
- **Adapter** — austauschbare Zugriffsart einer Integration (`api` | `mcp` | `cli`).
- **Vertrauensgrenze** — die Linie, innerhalb derer Akteuren vertraut wird (Phase 3: die geteilte DB).
- **RBAC-lite** — leichtgewichtige Rollen **Kurator** (darf Registries editieren/freigeben) vs.
  **Member** (refined, reviewed).

> *„Control Plane", „Execution Plane" und „Runner" sind **kein** aktuelles Vokabular — durch
> [D17](decisions.md) ersetzt (siehe historische Notiz in §4).*

**Verweismatrix** (autoritatives Dokument je Thema):

| Thema | Autoritatives Dokument |
|---|---|
| Topologie, Datenfluss, Trust-Verortung, Sequenzen | **dieses Dokument** |
| Entitäten, Felder, ER, State-Machine, Output-Schema, Enforcement-Mechanik | [datenmodell.md](datenmodell.md) |
| Entscheidungen, Begründungen, Historie | [decisions.md](decisions.md) |
| Scope, Phasenziele, Module, KPIs, Integrations-Prioritäten | [feature-roadmap.md](feature-roadmap.md) |
| Tickets, Etappen, Akzeptanzkriterien | [phase-2-backlog](../tickets/phase-2-backlog.md) · [phase-3-backlog](../tickets/phase-3-backlog.md) |
| UI-Wireframes *(älter, Mock-Annahmen — nicht für aktuelle Architektur/Scope/Auth)* | [ui-ux-concept.md](ui-ux-concept.md) |

> **Definition of Done:** Ändert eine neue Entscheidung die Topologie, ist das Aktualisieren des
> betroffenen Diagramms **und** der Evolutions-Tabelle (§4) Pflicht. Jede Bildunterschrift nennt ihre
> `[D..]`-Basis.
