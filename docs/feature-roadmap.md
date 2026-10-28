# Feature Roadmap: Agentic AI SDLC Platform

Ausrichtung: Anthropics [AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).
Grundsatzentscheidungen: [decisions.md](decisions.md) (E1–E5).

## 1. Ziel und Leitprinzipien

Die Plattform führt Arbeit durch die sechs Stufen des Playbooks — vom rohen Ticket bis zum Betrieb — mit
Agenten, die die Artefakte schreiben, und Menschen, die an definierten Gates freigeben.

1. **Real first:** eine echte, schmale End-to-End-Schleife statt Demo-Attrappen.
2. **Inhalte in Git, Zustand in der Plattform:** Artefakte sind Markdown-Dateien im Ziel-Repo; die
   Plattform kennt nur Stufe, Log und Verweise (E1).
3. **Mensch gibt frei:** jede Stufe endet an einem Gate — einem PR, den ein Mensch merged.
4. **Eine Metrik pro Stufe:** jede Stufe wird an genau einer Kennzahl gemessen.

## 2. Produktthese

Agenten schreiben Code in Stunden — der Engpass liegt bei Planung, Review und Freigabe. Teams brauchen
keine weitere Ablage, sondern einen **Control Layer**: Er führt den Zustand jedes Tickets über die Stufen,
stößt die Agenten an und macht sichtbar, wo Arbeit auf eine Freigabe wartet. Die Inhalte bleiben im Repo
des Teams.

## 3. Arbeitsmodell

```text
  Ticket (Jira o. A.; im Showcase: examples/tickets/*.md)
     |
     v
  +---------+  Merge  +---------+  Merge  +---------+  Merge  +---------+
  | intent  | ------> |  spec   | ------> |  plan   | ------> | Code-PR | --> Produktion
  +---------+         +---------+         +---------+         +---------+         |
       ^                                                                          |
       +------------------------- Befund -> neues intent <------------------------+

  je Stufe:  Branch <TICKET>/<stufe>  +  docs/work/<TICKET>/<artefakt>.md  +  PR (= Gate)
  Plattform: Stufe + Log pro Ticket in der DB; erkennt Merges ueber die Git-Host-API
```

- **Ticket-Eingang:** Jira o. Ä. liefert nur den rohen Inhalt. Kein Spiegel zurück; höchstens ein
  Statuswechsel. Branch-Namen mit Ticket-Schlüssel verknüpfen sich in Jira von selbst.
- **Gate:** Der PR einer Stufe wird von einem Menschen geprüft und gemergt; der Merge schaltet die nächste
  Stufe frei.

## 4. Die sechs Stufen

| Stufe | Artefakt | Gate (wer gibt frei) | Metrik | Status |
|---|---|---|---|---|
| **1 Plan** | `intent.md` — Problem, gewünschtes Ergebnis, Betroffene, offene Punkte | Product Owner | Zeit vom Ticket bis zum freigegebenen Intent | **Showcase** |
| **2 Design** | `spec.md` — User Story, Akzeptanzkriterien, betroffene Dateien, Risiken | Product Owner; riskante Specs zusätzlich Policy-Owner | Review-Runden bis zur Freigabe der Spec | **Showcase** |
| 3 Build | `plan.md` + Code-PR | Tech Lead bei riskanten Änderungen | Anteil PRs ohne Nacharbeit gemergt | Ausblick |
| 4 Test | Evals aus 20–50 echten Fällen; jeder Incident fügt einen hinzu | automatisch, Mensch bei Abweichung | Eval-Bestehensquote | Ausblick |
| 5 Deploy | Review des PR gegen geschriebene Policies | Mensch — nie der Agent, der den Code schrieb | policy-bezogene Review-Kommentare pro PR (Ziel: nahe null) | Ausblick |
| 6 Maintain | Befund aus Monitoring → neues `intent.md` | Product Owner | Zeit vom Alert bis zum neuen Intent | Ausblick |

**Stufe 1 — Plan.** Aus dem rohen Ticket schreibt der Agent `intent.md`: was das Problem ist, was erreicht
werden soll, wer betroffen ist, was offen ist. Der Product Owner prüft und merged.

**Stufe 2 — Design.** Aus dem freigegebenen Intent und der Codebase schreibt der Agent `spec.md` — mit
Rückfragen, wo Regeln unklar sind. Das ist das heutige Refinement, künftig als Datei im Repo.

**Stufe 3 — Build (Ausblick).** Der Agent schreibt zuerst `plan.md`, nach Freigabe den Code und öffnet einen
Code-PR. Team-Wissen liegt in `CLAUDE.md`, Skills und Hooks des Ziel-Repos.

**Stufe 4 — Test (Ausblick).** Der Agent prüft seine Arbeit selbst, bevor ein Mensch sie sieht. Evals aus
echten früheren Fällen sichern die Qualität; jeder Incident wird zu einem neuen Fall.

**Stufe 5 — Deploy (Ausblick).** Ein Agent reviewt den PR gegen die geschriebenen Policies; ein Mensch
genehmigt den Merge. Der Agent, der den Code schrieb, kann nicht selbst freigeben.

**Stufe 6 — Maintain (Ausblick).** Monitoring und Alerts lösen eine Diagnose aus; der Agent schreibt ein neues
`intent.md` — der Kreislauf beginnt von vorn.

## 5. Integrationen je Stufe

| Integration | ab Stufe | Rolle |
|---|---|---|
| Git-Host (GitHub) | 1 | Pflicht: Branches, Dateien, PRs, Merge-Status |
| Ticket-System (Jira o. Ä.) | 1 | optional: Eingang; später Statuswechsel, kein Inhalts-Spiegel |
| CI | 4 | Testläufe und Evals |
| Monitoring / Alerts | 6 | Auslöser für neue Intents |

## 6. Stand heute und nächster Schritt

**Heute:** Die lokale App verfeinert ein Ticket gegen ein Ziel-Repo — mit Rückfragen, Live-Fortschritt und
Ergebnis in der Datenbank. Ziel-Repo der Demo ist der Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app));
Beispiel-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

**Nächster Schritt:** Umbau auf Stufe 1 und 2 nach dem Arbeitsmodell — Tickets aus `examples/tickets/*.md`
einlesen, `intent.md` und `spec.md` als Dateien auf eigenen Branches mit PR, Stufe und Log pro Ticket in der
Datenbank, Übergang beim Merge.

**Später:** Betrieb im Team und im Unternehmen (gemeinsamer Zustand, Rollen) — erst wenn das Arbeitsmodell
in Stufe 1 und 2 trägt.
