# Feature Roadmap: Agentic AI SDLC Platform

Ausrichtung: Anthropics [AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).
Grundsatzentscheidungen: [decisions.md](decisions.md) (E1–E5).

## 1. Ziel und Leitprinzipien

Die Plattform führt Arbeit durch die sechs Stufen des Playbooks — vom rohen Ticket bis zum Betrieb — mit
Agenten, die die Artefakte schreiben, und Menschen, die an definierten Gates freigeben.

1. **Real first:** eine echte, schmale End-to-End-Schleife statt Demo-Attrappen.
2. **Inhalte in Git, Zustand in der Plattform:** Artefakte sind Markdown-Dateien im Ziel-Repo; die
   Plattform hält nur Zustand und Log (mit Verweisen auf Branch, PR und Commit) (E1).
3. **Mensch gibt frei:** jede Stufe hat ein menschliches Gate — meist den Merge eines PR.
4. **Zwei Kennzahlen pro Stufe:** eine Leitmetrik (Tempo) und eine Ergebnismetrik (Qualität).

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

  Stufe 1+2: Branch <TICKET>/intent|spec + docs/work/<TICKET>/intent|spec.md + PR (= Gate)
  Plattform: Stufe + Log pro Ticket in der DB; erkennt Merges ueber die Git-Host-API
```

- **Ticket-Eingang:** Jira o. Ä. liefert nur den rohen Inhalt. Kein Spiegel zurück; höchstens ein
  Statuswechsel. Branch-Namen mit Ticket-Schlüssel verknüpfen sich in Jira von selbst (mit der
  Git-Integration von Jira).
- **Gate:** Der PR einer Stufe wird von einem Menschen geprüft und gemergt; der Merge schaltet die nächste
  Stufe frei.

## 4. Die sechs Stufen

| Stufe | Artefakt | Gate (wer gibt frei) | Leitmetrik (Tempo) | Ergebnismetrik (Qualität) | Status |
|---|---|---|---|---|---|
| **1 Plan** | `intent.md` | Product Owner | Zeit vom ersten Gespräch bis zum committeten `intent.md` | Anteil der Intents, die der Product Owner in Stufe 2 übernimmt | **Showcase (gebaut)** |
| **2 Design** | `spec.md` | Product Owner; bei höherem Risiko Tech Lead, markierte Bedenken an Policy-Owner | Zeit zwischen `intent.md`- und `spec.md`-Commit | Nacharbeit an Anforderungen nach Build-Start (`spec.md`-Commits nach dem ersten `plan.md`-Commit) | **Showcase (folgt)** |
| 3 Build | `plan.md` + Code-Diff | Engineer gibt den Plan frei; Tech Lead/Architekt bei höherem Risiko | Anteil der Änderungen, die im ersten Durchgang gemergt werden | Nacharbeits-Zyklen pro Änderung; Übereinstimmung von Diff und `plan.md` | Ausblick |
| 4 Test | Testergebnisse, Build-Logs, Screenshot-Diffs; Evals aus 20–50 echten Aufgaben | Code Owner im PR-Review | First-Pass-CI-Erfolgsquote agentengeschriebener Änderungen | Review-Zeit pro PR | Ausblick |
| 5 Deploy | PR mit Review-Befunden, freigegebene Change-Tickets | Code Owner per Branch Protection, Release Manager für Produktion — nie der Agent, der den Code schrieb | Zeit bis zum ersten Review (Ziel: Minuten) | vor dem Merge gefundene vs. in Produktion entkommene Fehler | Ausblick |
| 6 Maintain | neues `intent.md` aus Monitoring, Incident-Records | Service Owner / On-Call; Verwerfungen mit Begründung | Zeit vom Schwellwert-Bruch bis zum `intent.md` in der Triage | Anteil der Befunde, die zu gemergten Fixes werden; wiederholte Incidents | Ausblick |

**Stufe 1 — Plan.** Aus dem rohen Ticket schreibt der Agent `intent.md`: was das Problem ist, was erreicht
werden soll, wer betroffen ist, was offen ist. Der Product Owner prüft und merged.

**Stufe 2 — Design.** Aus dem freigegebenen Intent und der Codebase schreibt der Agent `spec.md` — mit
Rückfragen, wo Regeln unklar sind. Der Product Owner gibt frei, bei höherem Risiko zusätzlich der Tech
Lead; markierte Bedenken gehen an den Policy-Owner.

**Stufe 3 — Build (Ausblick).** Der Agent schreibt zuerst `plan.md`, nach Freigabe den Code und öffnet einen
Code-PR. Team-Wissen liegt in `CLAUDE.md`, Skills und Hooks des Ziel-Repos.

**Stufe 4 — Test (Ausblick).** Der Agent prüft seine Arbeit selbst und liefert Testnachweise —
Testergebnisse, Build-Logs, Screenshot-Diffs. Evals aus 20–50 echten Aufgaben sichern die Qualität; jeder
Incident wird zu einem neuen Fall. Der Code Owner prüft die Nachweise im PR-Review.

**Stufe 5 — Deploy (Ausblick).** Ein Agent reviewt den PR gegen die geschriebenen Policies; der Code Owner
genehmigt den Merge per Branch Protection, der Release Manager die Produktion. Der Agent, der den Code
schrieb, kann nicht selbst freigeben.

**Stufe 6 — Maintain (Ausblick).** Monitoring und Alerts lösen eine Diagnose aus; der Agent schreibt ein neues
`intent.md`. Service Owner bzw. On-Call triagiert — übernimmt den Befund oder verwirft ihn mit Begründung —,
und der Kreislauf beginnt von vorn.

## 5. Integrationen je Stufe

| Integration | ab Stufe | Rolle |
|---|---|---|
| Git-Host (GitHub) | 1 | Pflicht: Branches, Dateien, PRs, Merge-Status |
| Ticket-System (Jira o. Ä.) | 1 | optional: Eingang; später Statuswechsel, kein Inhalts-Spiegel |
| CI | 4 | Testläufe und Evals |
| Monitoring / Alerts | 6 | Auslöser für neue Intents |

## 6. Stand heute und nächster Schritt

**Heute:** Stufe 1 läuft Ende zu Ende über Git. Die lokale App liest die Tickets aus `examples/tickets/*.md`,
der Intent-Agent schreibt `intent.md` (mit Rückfragen in der App), die App legt die Datei auf dem Branch
`<TICKET>/intent` ab und öffnet einen PR gegen den Arbeitsbranch `showcase`. Der Merge schiebt das Ticket in
Stufe 2; Stufe, Zustand und Log liegen in der Datenbank, der Inhalt in Git. Ein Reset setzt `showcase` auf den
Tag `showcase-base` zurück, `master` bleibt unberührt. Ziel-Repo der Demo ist der Fork der Blog-API „Conduit“
([wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app));
Beispiel-Tickets → [`examples/tickets/`](../examples/tickets/README.md).

**Nächster Schritt:** Stufe 2 (Design) — ein Spec-Agent schreibt aus dem gemergten `intent.md` und der
Codebase `spec.md` auf dem Branch `<TICKET>/spec`, PR gegen `showcase`; der Merge setzt das Ticket auf Fertig.

**Später:** Betrieb im Team und im Unternehmen (gemeinsamer Zustand, Rollen) — erst wenn das Arbeitsmodell
in Stufe 1 und 2 trägt.
