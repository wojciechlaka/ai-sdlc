# Design: Playbook-Stufe 2 (Design → `spec.md`)

Datum: 2026-10-29 · Status: abgestimmt, bereit für Implementierungsplan · Branch: `feature/playbook-stage-2`
Grundlage: [Playbook-Stufen-Spec](2026-10-28-playbook-stages-design.md) (Teil B in §10), [E1–E6](../../decisions.md),
[Architektur](../../architecture.md)

## 1. Ziel

Tickets in Stufe 2 bekommen einen **Design-Agent**, der aus dem gemergten `intent.md` und der Codebase eine
`spec.md` schreibt. Inhalt und Vorgehen orientieren sich an den Superpowers-Skills für Specs: Gliederung eines
Design-Specs, Rückfragen einzeln, bei echten Alternativen 2–3 Ansätze zur Wahl. Die Spec kommt wie der Intent
auf eigenem Branch mit PR gegen `showcase`; der Merge setzt das Ticket auf `done`.

## 2. Gliederung der `spec.md`

```markdown
---
ticket: CB-2
stage: design
source: examples/tickets/cb-2-lesezeit.md
intent: docs/work/CB-2/intent.md
---

# CB-2: <Titel>

## Ziel
## Gewählter Ansatz          (Ansatz, Begründung; **Verworfene Alternativen:** je Name — Grund)
## Architektur und Komponenten   (je Einheit: Zweck, Schnittstelle, Abhängigkeiten)
## Datenfluss
## Fehlerbehandlung
## Akzeptanzkriterien         (prüfbar; jedes Erfolgskriterium des Intents ist abgedeckt)
## Tests                      (was mit welcher Testart geprüft wird)
## Betroffene Dateien         (`pfad` — was sich ändert)
## Risiken                    ([hoch|mittel|niedrig] Risiko — Gegenmaßnahme)
## Offene Punkte
## Geklärte Rückfragen        (Auswahlen als „Ansatz B: … — Anmerkung: …“)
```

Leere Listen und Abschnitte zeigen „Keine.“ wie beim Intent; die Gliederung ist immer gleich. Der YAML-Kopf
verweist auf den Intent (Kette Intent → Spec in der Datei sichtbar) und enthält keinen Zustand.

`renderSpec(ticket, spec, answeredQuestions)` ist eine reine Funktion in `domain/render.ts`; einzeilige Felder
werden wie beim Intent auf eine Zeile normalisiert, Frage und Antwort mit hartem Zeilenumbruch.

## 3. Ausgabe des Agents (Zod in `packages/shared`)

```text
SpecSchema = {
  title (≤ 60), goal,
  approach: { chosen, rationale, alternatives: [{ name, reason }] },
  components: [{ name, purpose, interface, dependsOn: string[] }],
  dataFlow, errorHandling,
  acceptanceCriteria: string[] (≥ 1),
  tests,
  affectedFiles: [{ path, change, isNew: boolean }],
  risks: [{ description, severity: low|medium|high, mitigation }],
  openPoints: [{ question }],
}

SpecAgentOutput =
  | { type: 'question', question }
  | { type: 'choice', question, options: [{ id: 'A'|'B'|'C', title, description, pros: string[], cons: string[] }]
      (2–3 Optionen, ids eindeutig), recommended: id einer Option }
  | { type: 'spec', result: SpecSchema }

StageOutput = IntentAgentOutput | SpecAgentOutput
```

`QuestionOutputSchema` liegt künftig in einer gemeinsamen Datei für Agent-Ausgaben. `RefinementOutputSchema`,
`AgentOutputSchema` (Typ `refinement`) und `refinementSchema.ts` entfallen; `confidence` gibt es nicht mehr.

## 4. Ablauf

**Skill `packages/core/skills/spec-agent.md`** (ersetzt `refinement-agent.md`):

1. Intent lesen (steht im Prompt; liegt auch im Klon unter `docs/work/<KEY>/intent.md`).
2. Codebase gezielt untersuchen (bestehende Muster, betroffene Stellen; Codebase-Übersicht nutzen).
3. Gibt es **echte Alternativen**, die die Architektur bestimmen → `choice` mit 2–3 Ansätzen, Vor- und Nachteilen
   und einer Empfehlung. Kein `choice` für Geschmacksfragen.
4. Blockiert eine **fachliche Lücke** die Spec → `question` (eine Frage pro Lauf).
5. Sonst die Spec: jedes Erfolgskriterium des Intents durch Akzeptanzkriterien abgedeckt; YAGNI — nichts, was der
   Intent nicht verlangt; keine Implementierung, nur Design. Sprache des Tickets.

**Grenze: höchstens 3 Rückfragen/Auswahlen pro Stufe.** Der Kern zählt `question`- und `choice`-Ausgaben der
Läufe dieser Stufe (reine Funktion in `domain/rules.ts`). Der Prompt nennt „Du hast noch N von 3
Rückfragen/Auswahlen“; bei N = 0 verlangt er ausdrücklich die Spec („Unklares unter Offene Punkte“). Kommt bei
N = 0 trotzdem eine Rückfrage oder Auswahl, endet der Lauf `failed` mit der Meldung „Rückfragen-Grenze erreicht —
der Agent hat keine Spec geliefert“ (erneut startbar). Die Zählung beginnt mit jedem neuen Start der Stufe (jüngster Lauf mit Trigger `initial`)
von vorn, so dass eine fehlgeschlagene Stufe mit vollem Budget neu gestartet werden kann; frühere Antworten
werden in einen neuen Start nicht übernommen. Stufe 1 bleibt unverändert (Intent-Agent: `question` oder
`intent`, keine Grenze außer der bisherigen Skill-Regel).

**Antwort auf eine Auswahl.** `answerQuestion(key, input)` akzeptiert zusätzlich `{ choice: 'A'|'B'|'C', note? }`
(Zod-Union mit `{ answer }`). Gespeichert wird die Wahl als beantwortete Frage
`{ question, answer: 'Ansatz B: <Titel> — Anmerkung: <note>' }` (ohne Anmerkung ohne Zusatz); ungültige id →
`ValidationError`. Log: neuer Typ `choice_offered` (Akteur `agent`, Payload `{ question, options: [{ id, title }], recommended }`) und
`answer_given` (Payload um optionales `choice` erweitert). `question_asked` bleibt für Freitext-Rückfragen.

**Eingang des Laufs.**
- **Klon auf `showcase`** für beide Stufen: vor jedem Lauf `git fetch origin <showcase>` und
  `git checkout -B <showcase> FETCH_HEAD` (`reset --hard`), robust gegen den Force-Reset; `core.symlinks=false`
  bleibt. Das sind Aufrufe der App, nicht des Agents (Guard unverändert).
- **Intent im Prompt:** `codeHost.readFile(artifactPath(key, 'plan'))` von `showcase`. Fehlt er, endet der Lauf
  `failed` mit „Intent fehlt auf showcase — erst Stufe 1 abschließen“.

**Ergebnis.** `renderSpec` → Branch `<KEY>/spec`, Datei `docs/work/<KEY>/spec.md`, PR `<KEY>: Spec` gegen
`showcase` (PR-Text mit `goal` als Kurzfassung) → `in_review`. Merge → `done` (vorhandene Mechanik).
`STARTABLE_STAGES` wird `['plan', 'design']`; `STAGE_AGENTS.design` = `spec-agent.md` + `SpecAgentOutputSchema`.

## 5. UI

- **Stufe 2, bereit/fehlgeschlagen:** wie Stufe 1 — Modellauswahl und **„Design starten“**, Hinweis „Der
  Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.“ Der
  Kasten „Stufe 2 ist noch nicht gebaut“ entfällt.
- **Auswahl (`awaiting_answer` mit `choice`):** neue Client-Komponente `ChoicePanel` an der Stelle von
  `QuestionPanel`: Frage, Optionen als Radio-Gruppe (Titel, Beschreibung, `+`/`−`-Listen, Empfehlung markiert und
  vorausgewählt), optionale Anmerkung, „Auswahl senden“ (aktiv, sobald eine Option gewählt ist) und „Abbrechen“.
  Tastaturbedienbar, `fieldset`/`legend`.
- **Zähler:** „Rückfrage N von 3“ an `ChoicePanel` und `QuestionPanel` in Stufe 2 (`TicketDetailDto` liefert
  `questionsAsked`/`questionLimit` der aktuellen Stufe).
- **Log:** „Auswahl: <Frage> — Ansatz A empfohlen“, „Antwort: Ansatz B — Anmerkung …“.
- Stufenansicht (`StagePanel`), Board-Spalte „Fertig“ und Kostenblock zeigen Stufe 2 ohne neue Komponenten.

## 6. Altlasten, Leitplanken

- Entfallen: `refinementSchema.ts` (außer `QuestionOutputSchema`, verschoben), `RefinementOutputSchema`,
  `AgentOutputSchema`, `skills/refinement-agent.md`. Grep auf übrige Reste (`refine`, `refinement`, `confidence`)
  in Code und Doku; historische Specs/Pläne bleiben unverändert.
- Leitplanken: Stufe 2 liest nur → **dieselbe Sandbox** und derselbe Guard. Der Guard-Eval bleibt unverändert.

## 7. Fehlerbehandlung

| Fall | Ergebnis |
|---|---|
| Intent fehlt auf `showcase` | Lauf `failed`, Meldung „Intent fehlt auf showcase — erst Stufe 1 abschließen“ |
| `fetch`/`checkout` von `showcase` scheitert | wie heute „Repository konnte nicht geladen werden …“ → `failed` |
| Rückfrage/Auswahl nach der Grenze | `failed`, „Rückfragen-Grenze erreicht …“ |
| ungültige Auswahl-id / leere Antwort | `ValidationError`, Meldung in der UI |
| Schema-Fehler der Ausgabe | ein Retry wie heute, dann `failed` |
| Stop/Reset während Stufe 2 | wie Stufe 1 (Lauf-Identität) |

## 8. Tests

- **Domäne:** `renderSpec` (exaktes Markdown, leere Abschnitte, mehrzeilige Felder); Zählen der Rückfragen pro
  Stufe; Text einer Auswahl-Antwort; `canStartStage` für `design`; Übergang `design → done`.
- **Use Cases (Fakes):** Design starten; ohne Intent auf `showcase`; `choice` → Antwort → Spec → PR; Grenze von 3
  inkl. „Frage danach → failed“; ungültige Auswahl; Stop/Reset in Stufe 2.
- **Adapter:** `STAGE_AGENTS.design`; Prompt mit Intent und verbleibenden Rückfragen; Klon auf `showcase` mit echtem
  git (inkl. Force-Reset des Remotes zwischen zwei Läufen).
- **Shared:** `SpecSchema`, `SpecAgentOutputSchema` (`choice` mit 2–3 Optionen, `recommended` gehört zu einer
  Option), Antwort-Union.
- **Web:** `ChoicePanel` (Empfehlung vorausgewählt, Anmerkung, Senden, Tastatur), Start in Stufe 2, Zähler,
  Log-Zeilen.
- Reviews nach Modell-Staffel: Sonnet für Pakete, Opus für Nebenläufigkeit (Klon-Umstellung) und die
  Gesamt-Review.

## 9. Qualitäts-Eval für Specs

`packages/core/evals/spec.eval.ts`, Aufruf `npm run eval:spec` (Wurzel: `npm run eval:spec -w packages/core`), nicht
Teil von `npm test`.

- **Fixture:** kleines Beispiel-Repo `packages/core/evals/fixtures/<name>/` (Mini-Express-API mit Artikel-Routen)
  und 2–3 Intents mit Erfolgskriterien (z. B. Lesezeit, Entwürfe) als Daten neben dem Eval. Der Eval kopiert das
  Fixture in einen Temp-Ordner, macht daraus ein git-Repo und lässt den **echten Spec-Agent** laufen — dieselbe
  Sandbox, derselbe Skill, dasselbe Schema wie die App (`STAGE_AGENTS.design`).
- **Ohne Rückfragen:** Start mit „0 Rückfragen übrig“; der Agent muss direkt die Spec liefern.
- **Feste Prüfungen** (eindeutig, ohne Modell): Ausgabe passt zu `SpecSchema`; jede Datei unter „Betroffene Dateien“
  existiert im Fixture, außer sie ist als neu markiert (`affectedFiles[].isNew`); Anzahl Akzeptanzkriterien ≥ Anzahl
  Erfolgskriterien; keine Code-Blöcke mit Implementierung in den Textfeldern; mindestens eine verworfene Alternative
  mit Grund.
- **Bewertung durch ein zweites Modell** (Antwort als JSON, Zod-geprüft): Intent, Spec und Fixture-Überblick gehen an
  den Bewerter; je Kriterium Punkte 1–5 mit Begründung:
  - *Abdeckung* — jedes Erfolgskriterium durch ein prüfbares Akzeptanzkriterium abgedeckt (Zuordnung wird
    mitgeliefert);
  - *Prüfbarkeit* — Akzeptanzkriterien beobachtbar und eindeutig;
  - *Passung zur Codebase* — Ansatz und Komponenten nutzen die vorhandenen Muster;
  - *YAGNI* — nichts, was der Intent nicht verlangt;
  - *Konsistenz* — Tests decken die Akzeptanzkriterien ab, Risiken haben Gegenmaßnahmen.
- **Ausgabe:** deutsche Tabelle pro Intent und Kriterium, Kosten und Dauer; Exit-Code 1, wenn eine feste Prüfung
  scheitert oder eine Bewertung unter der Schwelle liegt (Standard < 3 von 5). Rubrik, Schwellen und Fälle stehen in
  `evals/specRubric.ts` bzw. den Fixture-Daten.
- **Modelle:** Spec-Agent standardmäßig Sonnet (`EVAL_MODEL`), Bewerter Haiku (`EVAL_JUDGE_MODEL`). Geschätzt
  0,20–0,40 $ pro Lauf.
- **Bewerter in der Sandbox:** Der Bewerter-Aufruf bekommt keine Werkzeuge (`--allowedTools` leer bzw. nur Antwort),
  nur Text im Prompt.
- Governance als Code wird damit Skill → Hook → **zwei Evals**: Guard-Eval (darf der Agent das?) und Spec-Eval
  (ist das Ergebnis gut?).

## 10. Doku

README (Ablauf Stufe 2, `npm run eval:spec`), `docs/architecture.md` (Stand, Ablauf, Glossar), `docs/datenmodell.md` (`choice`,
Spec-Schema, Log-Payloads), `docs/ui-ux-concept.md` (`ChoicePanel`, Stufe 2), `CLAUDE.md`, Roadmap (Stufe 2
„gebaut“), Playbook-Stufen-Spec (§6/§10: Verweis auf dieses Spec).

## 11. Abnahme

- `npm test`, `npm run build`, `npm run lint` grün; `npm run eval:guard` und `npm run eval:spec` grün (Eval-Läufe
  kosten Tokens, nach Zustimmung).
- Manueller Durchlauf **nur nach Zustimmung** (Tokens, PRs im Fork): CB-1 (steht in Design) → „Design starten“ →
  ggf. Auswahl/Rückfrage → PR `CB-1: Spec` → Merge → „Fertig“, Spec-Inhalt in der App → Reset setzt alles zurück.

## 12. Nicht enthalten (YAGNI)

Fortsetzen der Sitzung (SDK/`--resume`), eigene Sandbox pro Stufe (beide Stufen lesen
nur), Abschnitt-für-Abschnitt-Freigabe in der App (das Gate ist der PR).

**Bekannte Grenzen.** Alle Läufe teilen einen Klon pro Ziel-Repo: Gleichzeitige Läufe sehen den Wechsel des
Klons (Aktualisierung, Checkout von `showcase`), und der Rückfall auf einen frischen Klon kann einen laufenden
Agent stören. Spätere Lösung: je Lauf ein eigenes `git worktree add --detach`.
