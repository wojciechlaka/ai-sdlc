# Playbook-Stufe 2 (Design) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tickets in Stufe 2 bekommen einen Design-Agent, der aus dem gemergten `intent.md` und der Codebase eine `spec.md` schreibt (mit Rückfragen und Auswahl zwischen Ansätzen, höchstens 3), sie per Branch `<KEY>/spec` und PR `<KEY>: Spec` gegen `showcase` vorschlägt und nach dem Merge auf „Fertig“ setzt — plus ein Qualitäts-Eval für Specs.

**Architecture:** Verträge in `packages/shared` (Spec, Auswahl, Antwort-Union, Log-Payloads, DTO-Felder), reine Regeln und Rendering in `packages/core/src/domain` (`renderSpec`, Rückfragen-Zählung, Auswahl-Antwort), Use Cases in `application/` (Intent von `showcase` lesen, Grenze durchsetzen, Auswahl anbieten und beantworten, Spec veröffentlichen), Adapter (`claudeCli`: Spec-Agent und Prompt; `git`: Klon auf `showcase` per fetch + `checkout -B`), Web (`StartStagePanel`, `ChoicePanel`, Zähler, Log-Zeilen) und ein Eval (`evals/spec.eval.ts`) mit Fixture-Repo, festen Prüfungen und Bewerter-Modell. Keine neue DB-Spalte: Auswahl und Spec stecken im JSON-`output` des AgentRun.

**Tech Stack:** TypeScript, Zod 4, Vitest 4, ArchUnitTS, Next.js 16 (App Router, React 19, Testing Library), Claude CLI (`claude --print`), git.

**Spec:** [`docs/superpowers/specs/2026-10-29-playbook-stage-2-design.md`](../specs/2026-10-29-playbook-stage-2-design.md)

---

## Rahmen

- **Branch:** `feature/playbook-stage-2` (existiert, enthält das Spec). Dort bleiben, nicht pushen.
- **Commits:** einer pro Task, Nachricht auf Deutsch (`feat(core): …`, `docs: …`), immer mit Trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (die Commit-Befehle in den Tasks enthalten ihn).
- **Einzelne Tests** (aus der Repo-Wurzel):
  `npx vitest run --root packages/shared <datei>`, `npx vitest run --root packages/core <datei>`,
  `npx vitest run --root apps/web <datei>` — Pfade relativ zum Workspace, z. B.
  `npx vitest run --root packages/core src/domain/render.test.ts`.
- **Immer grün:** Die Reihenfolge ist so gewählt, dass nach **jedem** Task aus der Wurzel
  `npm test && npm run build && npm run lint` grün sind (Verträge, die Web oder Kern brechen würden, kommen im
  selben Task wie ihre Nutzer: Log-Typ + `logFormat` in Task 2, `StageOutput`-Erweiterung + `executeRun` in Task 4,
  DTO + Web-Fixture in Task 8). Zwischenstand bis Task 9: Ein *manueller* Design-Start in der laufenden App endet
  mit „Für die Stufe design gibt es noch keinen Agent“, weil der Claude-Adapter `design` erst in Task 9 bekommt.
- **Diffs:** Geänderte Dateien stehen als Diff gegen den Stand **vor** dem jeweiligen Task (Kontextzeilen
  unverändert übernehmen); neue Dateien vollständig.
- **Konventionen (CLAUDE.md):** Code, Kommentare, JSDoc, Testnamen und Server-Logs Englisch; alles, was Nutzer oder
  Agent sehen, Deutsch (UI, Log-Einträge, Fehlermeldungen, Prompt, Skill-Ausgabeformat, Eval-Bericht). In
  Produktionscode `if`/`else`/`for`/`while` immer mit Klammern und Rumpf auf eigener Zeile (ESLint `curly` +
  `brace-style`); kurze JSDoc an jedem exportierten Symbol; Domänenfehler über `errorCode(err)` prüfen.
- **Nicht tun:** `apps/web/.env.local` nicht lesen, keine GitHub-Aufrufe, kein echter `claude`, den Dev-Server
  nicht anfassen. `npm run eval:guard`, `npm run eval:spec` und der manuelle CB-1-Durchlauf nur nach Zustimmung
  des Nutzers (Task 15).

## Festlegungen zu Punkten, die das Spec offenlässt

- **Zählung der Rückfragen „pro Stufe“:** gezählt werden `question`/`choice`-Ausgaben ab dem letzten Lauf mit
  `trigger: 'initial'` der Stufe. Ein Neustart (auch nach „Rückfragen-Grenze erreicht“, Spec §7 „erneut startbar“)
  beginnt wieder bei 0; sonst wäre der Neustart sofort wieder am Limit.
- **Lauf über der Grenze:** Der AgentRun bleibt `succeeded` (die Ausgabe ist gültig), die Stufe endet `failed` mit
  der Meldung aus Spec §4 — wie heute beim gescheiterten PR.
- **Antwort passt nicht zur offenen Frage** (Freitext auf eine Auswahl, Auswahl auf eine Rückfrage, nicht
  angebotene id): `ValidationError` mit deutscher Meldung. Die Antwort-Union ist strikt (`{ answer }` **oder**
  `{ choice, note? }`).
- **Text der Wahl:** „Ansatz B: <Titel> — Anmerkung: <note>“; Anmerkung getrimmt, leer = ohne Zusatz. Der Log-Eintrag
  `answer_given` trägt diesen Text plus `choice`; die Log-Zeile ist „Antwort: Ansatz B: <Titel> — Anmerkung: …“.
- **`spec.md`-Details:** Marker für neue Dateien „(neu)“; Risiken „[hoch|mittel|niedrig] Beschreibung — Gegenmaßnahme“;
  Komponenten als `###`-Unterabschnitte mit Zweck/Schnittstelle/Abhängigkeiten; leere Textabschnitte „Keine.“.
- **Ticket-Detail:** neben `questionsAsked`/`questionLimit` (Spec §5) auch `pendingChoice` (Auswahl ohne `type`);
  `questionLimit` ist `null` in Stufe 1 und bei „Fertig“, dann zeigt die UI keinen Zähler.
- **Intent lesen:** vor dem Klon; GitHub-Fehler beim Lesen → `failed` mit der Meldung des `CodeHostError`.
- **Prompt beim Retry:** Intent und Rückfragen-Rest stehen auch im Korrektur-Prompt (neuer Prozess ohne Gedächtnis).
- **Bewerter ohne Werkzeuge:** `--disallowedTools` mit allen Werkzeugen, Guard-Hooks per `--settings`, leeres
  Temp-`cwd`; zusätzlich feste Prüfung „Hook-Log leer“. Die Rubrik-Funktionen sind rein und laufen mit `npm test`
  (Vitest schließt nur noch `evals/**/*.eval.ts` und `evals/fixtures/**` aus).
- **Namen mit „Refinement“** (Produkt, Pakete, Umgebungsvariablen) bleiben; entfernt wird nur der alte
  Refinement-Agent (Schema, Skill, Doku-Verweise).

## Dateien

| Datei | Aktion | Verantwortung | Task |
|---|---|---|---|
| `packages/shared/src/agentOutput.ts` (+Test) | neu | `QuestionOutputSchema` (verschoben), `ChoiceIdSchema`, `ChoiceOptionSchema`, `PendingChoiceSchema`, `ChoiceOutputSchema` (2–3 Optionen, ids eindeutig, Empfehlung gehört dazu) | 1 |
| `packages/shared/src/specSchema.ts` (+Test) | neu | `SpecSchema` (inkl. `affectedFiles[].isNew`), `SpecOutputSchema`, `SpecAgentOutputSchema` | 1 |
| `packages/shared/src/refinementSchema.ts` (+Test) | löschen | ersetzt durch `agentOutput.ts`/`specSchema.ts` | 1 |
| `packages/shared/src/intentSchema.ts` | ändern | Import aus `agentOutput`, `IntentOutputSchema`; `StageOutput` zieht in Task 4 aus | 1, 4 |
| `packages/shared/src/index.ts` | ändern | Exporte | 1, 4 |
| `packages/shared/src/auditEvents.ts` (+Test) | ändern | `choice_offered`, `answer_given.choice?` | 2 |
| `apps/web/lib/logFormat.ts` (+Test) | ändern | Log-Zeilen „Auswahl: … — Ansatz A empfohlen“, Fallback „Auswahl“ | 2 |
| `packages/core/src/domain/render.ts` (+Test) | ändern | `renderSpec` | 3 |
| `packages/shared/src/stageOutput.ts` (+Test) | neu | `StageOutputSchema` = question \| choice \| intent \| spec | 4 |
| `packages/core/src/domain/rules.ts` (+Test) | ändern | `STARTABLE_STAGES` mit `design`; `QUESTION_LIMIT`, `questionLimit`, `countQuestionsAsked`, `questionsRemaining`; `choiceAnswerText`, `planAnswerRun(runs, input)` | 4, 6, 7 |
| `packages/core/src/application/executeRun.ts` | ändern | `choice` → `awaiting_answer` + `choice_offered`; `spec` → `renderSpec` + PR; Rückfragen-Rest an den Agent, Grenze durchsetzen; Intent an den Agent | 4, 5, 6 |
| `packages/core/src/application/designStage.test.ts` | neu | Use-Case-Tests Stufe 2 mit Fakes | 4–7 |
| `packages/core/src/testing/samples.ts` | ändern | `SAMPLE_SPEC`, `SAMPLE_SPEC_OUTPUT`, `SAMPLE_CHOICE_OUTPUT` | 4 |
| `packages/core/src/application/stageCommands.test.ts` | ändern | Design ist startbar (Ablehnungsfall angepasst) | 4 |
| `packages/core/src/application/runStage.ts` | ändern | Intent von `showcase` lesen, `failAttempt` | 5 |
| `packages/core/src/application/messages.ts` | ändern | `INTENT_MISSING`, `QUESTION_LIMIT_REACHED` | 5, 6 |
| `packages/core/src/ports/agentRunner.ts` | ändern | `AgentRunnerInput.intent?`, `.questionsRemaining?` | 5, 6 |
| `packages/shared/src/api.ts` (+Test) | ändern | `AnswerInputSchema`-Union; `TicketDetailDto.pendingChoice`, `questionsAsked`, `questionLimit` | 7, 8 |
| `packages/core/src/application/stageCommands.ts` | ändern | `answerQuestion` mit Auswahl | 7 |
| `packages/core/src/application/queries.ts` (+Test) | ändern | `questionState()` statt `pendingQuestion()` | 8 |
| `apps/web/test/fixtures.ts` | ändern | neue DTO-Felder in `aTicketDetail` | 8 |
| `packages/core/src/adapters/claudeCli/index.ts` (+Test) | ändern | `STAGE_AGENTS` vollständig und exportiert (`design` → `spec-agent.md`) | 9 |
| `packages/core/src/adapters/claudeCli/prompt.ts` (+Test) | ändern | Abschnitte „Intent (gemergt auf showcase)“ und „Rückfragen“ | 9 |
| `packages/core/skills/spec-agent.md` | neu | Skill Stufe 2 | 9 |
| `packages/core/skills/refinement-agent.md` | löschen | ersetzt durch `spec-agent.md` | 9 |
| `packages/core/src/adapters/git/repoCache.ts` (+3 Tests) | ändern | Klon auf `showcase`: fetch + `checkout -B FETCH_HEAD` + `reset --hard` | 10 |
| `packages/core/src/adapters/git/repoCache.baseBranch.test.ts` | neu | echtes git: Base-Branch, Force-Reset zwischen zwei Läufen | 10 |
| `packages/core/src/compose.ts` | ändern | `baseBranch` an `createGitRepoProvider` | 10 |
| `apps/web/components/StartStagePanel.tsx` | ändern | „Design starten“ mit Modellauswahl und Hinweis | 11 |
| `apps/web/components/TicketActions.tsx` (+Test) | ändern | `ChoicePanel` bei `pendingChoice`, Zähler | 11, 12 |
| `apps/web/components/ChoicePanel.tsx` (+Test) | neu | Auswahl beantworten | 12 |
| `apps/web/components/QuestionPanel.tsx` (+Test) | ändern | Zähler | 12 |
| `apps/web/lib/format.ts` (+Test) | ändern | `questionCounter` | 12 |
| `apps/web/app/actions.ts` (+Test) | ändern | `answerQuestionAction(key, AnswerInput)` | 12 |
| `packages/core/evals/fixtures/articles-api/**` | neu | Fixture-Repo (Mini-Express-API) | 13 |
| `packages/core/evals/specCases.ts`, `specRubric.ts` (+Test), `spec.eval.ts` | neu | Fälle, Rubrik/feste Prüfungen, Eval-Lauf | 13 |
| `packages/core/{vitest.config.ts,tsconfig.json,eslint.config.mjs,package.json}`, `package.json`, `packages/core/src/architecture.test.ts` | ändern | Fixture ausnehmen, Rubrik-Test in `npm test`, `eval:spec`, Architekturtest | 13 |
| `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/datenmodell.md`, `docs/ui-ux-concept.md`, `docs/feature-roadmap.md`, `docs/superpowers/specs/2026-10-28-playbook-stages-design.md` | ändern | Doku nach Spec §10 | 14 |

---

## Tasks

### Task 1: Verträge in `packages/shared`: Agent-Ausgaben, Auswahl, Spec
**Files:**
- Create: `packages/shared/src/agentOutput.test.ts`
- Create: `packages/shared/src/agentOutput.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/intentSchema.ts`
- Delete: `packages/shared/src/refinementSchema.test.ts`
- Delete: `packages/shared/src/refinementSchema.ts`
- Create: `packages/shared/src/specSchema.test.ts`
- Create: `packages/shared/src/specSchema.ts`

`QuestionOutputSchema` zieht in die neue gemeinsame Datei `agentOutput.ts` (mit der Auswahl `choice`); `specSchema.ts` beschreibt die Spec (inkl. `affectedFiles[].isNew`) und die Ausgabe des Spec-Agents. `refinementSchema.ts` (+Test) entfällt — `git grep -n "refinementSchema\|RefinementOutput\|AgentOutputSchema"` zeigt außer `packages/shared` keine Nutzer. `StageOutputSchema` bleibt in diesem Task noch gleich `IntentAgentOutputSchema`; Task 4 erweitert es zusammen mit dem Kern, damit der Build nach jedem Task grün bleibt.

- [ ] **Step 1: Failing Tests schreiben**

Neu: `packages/shared/src/agentOutput.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ChoiceOutputSchema, PendingChoiceSchema, QuestionOutputSchema } from './agentOutput'

const OPTION_A = { id: 'A', title: 'Beim Speichern berechnen', description: 'Feld am Artikel.', pros: ['schnell'], cons: ['Migration'] }
const OPTION_B = { id: 'B', title: 'Beim Lesen berechnen', description: 'Im Service.', pros: ['keine Migration'], cons: [] }
const CHOICE = { type: 'choice', question: 'Wo wird die Lesezeit berechnet?', options: [OPTION_A, OPTION_B], recommended: 'B' }

describe('QuestionOutputSchema', () => {
  it('accepts a question and rejects one without text', () => {
    expect(QuestionOutputSchema.parse({ type: 'question', question: 'Wer?' })).toEqual({ type: 'question', question: 'Wer?' })
    expect(QuestionOutputSchema.safeParse({ type: 'question' }).success).toBe(false)
  })
})

describe('ChoiceOutputSchema', () => {
  it('accepts two or three options with a recommendation among them', () => {
    expect(ChoiceOutputSchema.parse(CHOICE)).toEqual(CHOICE)
    const three = { ...CHOICE, options: [OPTION_A, OPTION_B, { ...OPTION_B, id: 'C' }], recommended: 'C' }
    expect(ChoiceOutputSchema.safeParse(three).success).toBe(true)
  })

  it('rejects fewer than two or more than three options', () => {
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A], recommended: 'A' }).success).toBe(false)
    const four = [OPTION_A, OPTION_B, { ...OPTION_B, id: 'C' }, { ...OPTION_B, id: 'C' }]
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: four }).success).toBe(false)
  })

  it('rejects duplicate ids and ids other than A, B, C', () => {
    const duplicate = ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A, { ...OPTION_B, id: 'A' }], recommended: 'A' })
    expect(duplicate.error?.issues.map((issue) => issue.message)).toEqual(['Die ids der Optionen müssen eindeutig sein'])
    expect(ChoiceOutputSchema.safeParse({ ...CHOICE, options: [OPTION_A, { ...OPTION_B, id: 'D' }] }).success).toBe(false)
  })

  it('rejects a recommendation that is not one of the options', () => {
    const result = ChoiceOutputSchema.safeParse({ ...CHOICE, recommended: 'C' })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['recommended']])
  })
})

describe('PendingChoiceSchema', () => {
  it('is the choice without its type and checks the same rules', () => {
    const { type: _type, ...pending } = CHOICE
    expect(PendingChoiceSchema.parse(pending)).toEqual(pending)
    expect(PendingChoiceSchema.safeParse({ ...pending, recommended: 'C' }).success).toBe(false)
  })
})
```

Löschen: `packages/shared/src/refinementSchema.test.ts` (`git rm packages/shared/src/refinementSchema.test.ts`)

Neu: `packages/shared/src/specSchema.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { SpecAgentOutputSchema, SpecSchema } from './specSchema'

const SPEC = {
  title: 'Lesezeit in der Artikel-API',
  goal: 'Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.',
  approach: {
    chosen: 'Lesezeit beim Lesen im Service berechnen.',
    rationale: 'Keine Migration nötig.',
    alternatives: [{ name: 'Feld in der Datenbank', reason: 'braucht eine Migration' }],
  },
  components: [{ name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body: string): number', dependsOn: [] }],
  dataFlow: 'Service lädt Artikel → readingTime → Antwort.',
  errorHandling: 'Leerer Text ergibt 1 Minute.',
  acceptanceCriteria: ['GET /api/articles/:slug enthält readingTimeMinutes'],
  tests: 'Unit-Test für readingTime, Route-Test für das Feld.',
  affectedFiles: [{ path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false }],
  risks: [{ description: 'Lange Texte', severity: 'low', mitigation: 'Berechnung ist linear' }],
  openPoints: [],
}

describe('SpecSchema', () => {
  it('accepts a complete spec', () => {
    expect(SpecSchema.parse(SPEC)).toEqual(SPEC)
  })

  it('rejects long titles, missing acceptance criteria and unknown severities', () => {
    expect(SpecSchema.safeParse({ ...SPEC, title: 'x'.repeat(61) }).success).toBe(false)
    expect(SpecSchema.safeParse({ ...SPEC, acceptanceCriteria: [] }).success).toBe(false)
    expect(SpecSchema.safeParse({ ...SPEC, risks: [{ ...SPEC.risks[0], severity: 'critical' }] }).success).toBe(false)
  })

  it('requires isNew on every affected file', () => {
    expect(SpecSchema.safeParse({ ...SPEC, affectedFiles: [{ path: 'a.js', change: 'neu' }] }).success).toBe(false)
  })
})

describe('SpecAgentOutputSchema', () => {
  it('accepts a question, a choice and a spec', () => {
    expect(SpecAgentOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
    const choice = {
      type: 'choice', question: 'Wo?', recommended: 'A',
      options: [
        { id: 'A', title: 'a', description: 'd', pros: [], cons: [] },
        { id: 'B', title: 'b', description: 'd', pros: [], cons: [] },
      ],
    }
    expect(SpecAgentOutputSchema.parse(choice).type).toBe('choice')
    expect(SpecAgentOutputSchema.parse({ type: 'spec', result: SPEC }).type).toBe('spec')
  })

  it('rejects an invalid choice, the intent and the old refinement output', () => {
    expect(SpecAgentOutputSchema.safeParse({ type: 'choice', question: 'Wo?', options: [], recommended: 'A' }).success).toBe(false)
    expect(SpecAgentOutputSchema.safeParse({ type: 'intent', result: {} }).success).toBe(false)
    expect(SpecAgentOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/shared src/agentOutput.test.ts src/specSchema.test.ts
```

Erwartet: FAIL — `Failed to load url ./agentOutput` bzw. `./specSchema` (Dateien fehlen noch).

- [ ] **Step 3: Implementieren**

`intentSchema.ts`: Import aus `agentOutput`, neues `IntentOutputSchema`; `StageOutputSchema` bleibt unverändert.

Neu: `packages/shared/src/agentOutput.ts`

```ts
import { z } from 'zod'

// Agent outputs that ask the human instead of delivering the stage result: a free-text question (every stage)
// or a choice between 2–3 approaches (stage 2, Design).

/** A blocking question of an agent; every stage may return it instead of its result. */
export const QuestionOutputSchema = z.object({
  type: z.literal('question'),
  question: z.string(),
})
export type QuestionOutput = z.infer<typeof QuestionOutputSchema>

/** Id of an option in a choice. */
export const ChoiceIdSchema = z.enum(['A', 'B', 'C'])
export type ChoiceId = z.infer<typeof ChoiceIdSchema>

/** One approach the human can pick: title, description, pros and cons. */
export const ChoiceOptionSchema = z.object({
  id: ChoiceIdSchema,
  title: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
})
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>

/** Fields of a choice, shared by the agent output and the pending choice of the ticket page. */
const choiceFields = {
  /** What the human decides, e.g. „Wo wird die Lesezeit berechnet?“. */
  question: z.string(),
  /** 2–3 approaches with unique ids. */
  options: z.array(ChoiceOptionSchema).min(2).max(3),
  /** Id of the option the agent recommends; one of `options`. */
  recommended: ChoiceIdSchema,
}

/** Ids are unique and the recommendation is one of them. German messages: they reach the agent's retry prompt. */
function checkChoice(choice: { options: { id: ChoiceId }[]; recommended: ChoiceId }, ctx: z.RefinementCtx): void {
  const ids = choice.options.map((option) => option.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'Die ids der Optionen müssen eindeutig sein', path: ['options'] })
  }
  if (!ids.includes(choice.recommended)) {
    ctx.addIssue({ code: 'custom', message: 'recommended muss die id einer der Optionen sein', path: ['recommended'] })
  }
}

/** A choice without its `type`: what the ticket page shows while the ticket waits for the human's pick. */
export const PendingChoiceSchema = z.object(choiceFields).superRefine(checkChoice)
export type PendingChoice = z.infer<typeof PendingChoiceSchema>

/** The agent offers 2–3 approaches and recommends one; the human picks one (stage 2 only). */
export const ChoiceOutputSchema = z.object({ type: z.literal('choice'), ...choiceFields }).superRefine(checkChoice)
export type ChoiceOutput = z.infer<typeof ChoiceOutputSchema>
```

Ändern: `packages/shared/src/index.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,8 +1,12 @@
-export { RefinementOutputSchema, AgentOutputSchema, QuestionOutputSchema } from './refinementSchema'
-export type { RefinementOutput, AgentOutput } from './refinementSchema'
+export {
+  QuestionOutputSchema, ChoiceIdSchema, ChoiceOptionSchema, PendingChoiceSchema, ChoiceOutputSchema,
+} from './agentOutput'
+export type { QuestionOutput, ChoiceId, ChoiceOption, PendingChoice, ChoiceOutput } from './agentOutput'
+export { SpecSchema, SpecOutputSchema, SpecAgentOutputSchema } from './specSchema'
+export type { Spec, SpecAgentOutput } from './specSchema'
 export { StageSchema, ArtifactStageSchema, TicketStateSchema, PrStateSchema } from './stages'
 export type { Stage, ArtifactStage, TicketState, PrState } from './stages'
-export { IntentSchema, IntentAgentOutputSchema, StageOutputSchema } from './intentSchema'
+export { IntentSchema, IntentOutputSchema, IntentAgentOutputSchema, StageOutputSchema } from './intentSchema'
 export type { Intent, IntentAgentOutput, StageOutput } from './intentSchema'
 export {
   PullRequestRefSchema,
```

Ändern: `packages/shared/src/intentSchema.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,5 +1,5 @@
 import { z } from 'zod'
-import { QuestionOutputSchema } from './refinementSchema'
+import { QuestionOutputSchema } from './agentOutput'
 
 /** Result of stage 1 (Plan): what the problem is, not how to solve it. */
 export const IntentSchema = z.object({
@@ -22,11 +22,11 @@ export const IntentSchema = z.object({
 })
 export type Intent = z.infer<typeof IntentSchema>
 
+/** The intent as agent output. */
+export const IntentOutputSchema = z.object({ type: z.literal('intent'), result: IntentSchema })
+
 /** Agent output of stage 1: a blocking question or the intent. */
-export const IntentAgentOutputSchema = z.discriminatedUnion('type', [
-  QuestionOutputSchema,
-  z.object({ type: z.literal('intent'), result: IntentSchema }),
-])
+export const IntentAgentOutputSchema = z.discriminatedUnion('type', [QuestionOutputSchema, IntentOutputSchema])
 export type IntentAgentOutput = z.infer<typeof IntentAgentOutputSchema>
 
 /** Everything an agent run may return, across all stages. Part B adds the spec output of stage 2. */
```

Löschen: `packages/shared/src/refinementSchema.ts` (`git rm packages/shared/src/refinementSchema.ts`)

Neu: `packages/shared/src/specSchema.ts`

```ts
import { z } from 'zod'
import { ChoiceOutputSchema, QuestionOutputSchema } from './agentOutput'

/** Result of stage 2 (Design): how the intent is solved — approach, components, criteria, files, risks. */
export const SpecSchema = z.object({
  /** Short title of the spec (heading of `spec.md`). */
  title: z.string().max(60),
  /** What the change achieves, in a few sentences; also the PR summary. */
  goal: z.string(),
  /** The chosen approach, why, and the alternatives that were dropped. */
  approach: z.object({
    chosen: z.string(),
    rationale: z.string(),
    alternatives: z.array(z.object({ name: z.string(), reason: z.string() })),
  }),
  /** Units of the design: purpose, interface and what each depends on. */
  components: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
    interface: z.string(),
    dependsOn: z.array(z.string()),
  })),
  /** How data moves through the components. */
  dataFlow: z.string(),
  /** Which errors can occur and how they are handled. */
  errorHandling: z.string(),
  /** Verifiable criteria; together they cover every success criterion of the intent. */
  acceptanceCriteria: z.array(z.string()).min(1),
  /** What is verified with which kind of test. */
  tests: z.string(),
  /** Files that change; `isNew` marks files that do not exist yet. */
  affectedFiles: z.array(z.object({ path: z.string(), change: z.string(), isNew: z.boolean() })),
  /** Risks with severity and mitigation. */
  risks: z.array(z.object({
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
  })),
  /** Questions that stay open but do not block the spec. */
  openPoints: z.array(z.object({ question: z.string() })),
})
export type Spec = z.infer<typeof SpecSchema>

/** The spec as agent output. */
export const SpecOutputSchema = z.object({ type: z.literal('spec'), result: SpecSchema })

/** Agent output of stage 2: a blocking question, a choice between approaches, or the spec. */
export const SpecAgentOutputSchema = z.discriminatedUnion('type', [QuestionOutputSchema, ChoiceOutputSchema, SpecOutputSchema])
export type SpecAgentOutput = z.infer<typeof SpecAgentOutputSchema>
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/shared
npm test && npm run build && npm run lint
```

Erwartet: shared: alle Tests grün (u. a. 4 neue Testdateien-Blöcke); danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/shared/src/agentOutput.test.ts packages/shared/src/agentOutput.ts packages/shared/src/index.ts packages/shared/src/intentSchema.ts packages/shared/src/refinementSchema.test.ts packages/shared/src/refinementSchema.ts packages/shared/src/specSchema.test.ts packages/shared/src/specSchema.ts
git commit -m "feat(shared): Verträge für Spec, Auswahl und Rückfrage; Refinement-Schema entfernt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 2: Log-Vertrag `choice_offered`, `answer_given.choice` und Log-Zeilen
**Files:**
- Modify: `apps/web/lib/logFormat.test.ts`
- Modify: `apps/web/lib/logFormat.ts`
- Modify: `packages/shared/src/auditEvents.test.ts`
- Modify: `packages/shared/src/auditEvents.ts`

Neuer Log-Typ und erweiterte Payload in einem Task mit der Web-Anzeige: `FALLBACK_LABEL` und `describeLogEvent` in `apps/web/lib/logFormat.ts` sind erschöpfend über `AuditEventType` — ohne beide Änderungen wäre der Web-Build rot.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `apps/web/lib/logFormat.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -11,6 +11,15 @@ describe('describeLogEvent', () => {
     { input: aLogEntry('run_finished', { runId: 'r1', status: 'timeout' }), text: 'Agent-Zeitlimit überschritten' },
     { input: aLogEntry('question_asked', { question: 'Wer?' }, 'agent'), text: 'Rückfrage: Wer?' },
     { input: aLogEntry('answer_given', { answer: 'Alle' }, 'human'), text: 'Antwort: Alle' },
+    {
+      input: aLogEntry('choice_offered', { question: 'Wo wird die Lesezeit berechnet?', options: [{ id: 'A', title: 'Speichern' }, { id: 'B', title: 'Lesen' }], recommended: 'A' }, 'agent'),
+      text: 'Auswahl: Wo wird die Lesezeit berechnet? — Ansatz A empfohlen',
+    },
+    {
+      input: aLogEntry('answer_given', { answer: 'Ansatz B: Lesen — Anmerkung: ohne Cache', choice: 'B' }, 'human'),
+      text: 'Antwort: Ansatz B: Lesen — Anmerkung: ohne Cache',
+    },
+    { input: aLogEntry('choice_offered', { question: 'Wo?' }, 'agent'), text: 'Auswahl' },
     { input: aLogEntry('pr_opened', { prNumber: 4, prUrl: 'https://github.com/o/r/pull/4', branch: 'CB-2/intent' }), text: 'PR #4 geöffnet (CB-2/intent)' },
     { input: aLogEntry('pr_merged', { prNumber: 4 }, 'human'), text: 'PR #4 gemergt' },
     { input: aLogEntry('pr_closed', { prNumber: 4 }, 'human'), text: 'PR #4 ohne Merge geschlossen' },
```

Ändern: `packages/shared/src/auditEvents.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -13,6 +13,14 @@ describe('AuditEventSchema', () => {
     expect(AuditEventSchema.safeParse({ type: 'run_finished', payload: withUsage }).success).toBe(true)
   })
 
+  it('accepts an offered choice and an answer with or without the picked option', () => {
+    const offered = { question: 'Wo?', options: [{ id: 'A', title: 'Speichern' }, { id: 'B', title: 'Lesen' }], recommended: 'B' }
+    expect(AuditEventSchema.safeParse({ type: 'choice_offered', payload: offered }).success).toBe(true)
+    expect(AuditEventSchema.safeParse({ type: 'choice_offered', payload: { ...offered, recommended: 'D' } }).success).toBe(false)
+    expect(AuditEventSchema.parse({ type: 'answer_given', payload: { answer: 'Ansatz B: Lesen', choice: 'B' } }).payload).toEqual({ answer: 'Ansatz B: Lesen', choice: 'B' })
+    expect(AuditEventSchema.safeParse({ type: 'answer_given', payload: { answer: 'Alle Leser' } }).success).toBe(true)
+  })
+
   it('rejects unknown types and payloads of another type', () => {
     expect(AuditEventSchema.safeParse({ type: 'something_new', payload: {} }).success).toBe(false)
     expect(AuditEventSchema.safeParse({ type: 'pr_merged', payload: { message: 'x' } }).success).toBe(false)
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/shared src/auditEvents.test.ts
npx vitest run --root apps/web lib/logFormat.test.ts
```

Erwartet: FAIL — `choice_offered` wird abgelehnt (`expected false to be true`), `answer_given` verliert `choice`; in `logFormat.test.ts` liefert `describeLogEvent` „Eintrag choice_offered“ statt „Auswahl: …“.

- [ ] **Step 3: Implementieren**

Ändern: `apps/web/lib/logFormat.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -41,6 +41,7 @@ const FALLBACK_LABEL: Record<AuditEventType, string> = {
   run_started:     'Agent gestartet',
   run_finished:    'Agent-Lauf beendet',
   question_asked:  'Rückfrage',
+  choice_offered:  'Auswahl',
   answer_given:    'Antwort',
   pr_opened:       'PR geöffnet',
   pr_merged:       'PR gemergt',
@@ -83,6 +84,8 @@ export function describeLogEvent(entry: AuditLogEntryDto): string {
       return describeRunFinished(event.payload)
     case 'question_asked':
       return `Rückfrage: ${event.payload.question}`
+    case 'choice_offered':
+      return `Auswahl: ${event.payload.question} — Ansatz ${event.payload.recommended} empfohlen`
     case 'answer_given':
       return `Antwort: ${event.payload.answer}`
     case 'pr_opened':
```

Ändern: `packages/shared/src/auditEvents.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,5 +1,6 @@
 import { z } from 'zod'
 import { ArtifactStageSchema, StageSchema } from './stages'
+import { ChoiceIdSchema } from './agentOutput'
 
 // Contract of the per-ticket log (AuditEvent): one payload shape per event type. The core writes entries through
 // `AuditLog.append`, which is typed by `AuditPayloads`; the web parses stored entries with `AuditEventSchema`.
@@ -41,7 +42,14 @@ export const AuditEventSchema = z.discriminatedUnion('type', [
     reason: z.string().optional(),
   })),
   event('question_asked', z.object({ question: z.string() })),
-  event('answer_given', z.object({ answer: z.string() })),
+  /** The agent offered approaches to choose from (stage 2); the options without description, pros and cons. */
+  event('choice_offered', z.object({
+    question: z.string(),
+    options: z.array(z.object({ id: ChoiceIdSchema, title: z.string() })),
+    recommended: ChoiceIdSchema,
+  })),
+  /** `answer` is the text the next run sees; `choice` is set when the human picked an option of a choice. */
+  event('answer_given', z.object({ answer: z.string(), choice: ChoiceIdSchema.optional() })),
   event('pr_opened', z.object({ prNumber, prUrl: z.string(), branch: z.string() })),
   event('pr_merged', z.object({ prNumber })),
   event('pr_closed', z.object({ prNumber })),
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/shared src/auditEvents.test.ts
npx vitest run --root apps/web lib/logFormat.test.ts
npm test && npm run build && npm run lint
```

Erwartet: beide Testdateien grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/lib/logFormat.test.ts apps/web/lib/logFormat.ts packages/shared/src/auditEvents.test.ts packages/shared/src/auditEvents.ts
git commit -m "feat(shared): Log-Eintrag choice_offered und Auswahl in answer_given" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 3: `renderSpec` in `domain/render.ts`
**Files:**
- Modify: `packages/core/src/domain/render.test.ts`
- Modify: `packages/core/src/domain/render.ts`

Reine Funktion, Gliederung nach Spec §2. Einzeilige Felder (Titel, Listeneinträge, Komponentenfelder, Pfade, Risiken, Q&A) laufen durch `oneLine`; mehrzeilige Textfelder (`goal`, `chosen`, `rationale`, `dataFlow`, `errorHandling`, `tests`) bleiben mehrzeilig und werden nur getrimmt, leer → „Keine.“. Neue Dateien tragen den Marker „(neu)“. `renderPullRequestBody` ist schon stufenneutral; der neue Test sichert den Text für `design` (Titel „CB-2: Spec“, Kurzfassung = `goal`).

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/domain/render.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,6 @@
 import { describe, it, expect } from 'vitest'
-import type { Intent } from '@refinement/shared'
-import { renderIntent, renderPullRequestBody } from './render'
+import type { Intent, Spec } from '@refinement/shared'
+import { renderIntent, renderPullRequestBody, renderSpec } from './render'
 
 const TICKET = { key: 'CB-2', title: 'Lesezeit bei Artikeln anzeigen', sourcePath: 'examples/tickets/cb-2-lesezeit.md' }
 
@@ -104,3 +104,159 @@ describe('renderPullRequestBody', () => {
     )
   })
 })
+
+const SPEC: Spec = {
+  title: 'Lesezeit in der Artikel-API',
+  goal: 'Die Artikel-API liefert eine geschätzte Lesezeit.\nSie gilt für Liste und Einzelansicht.\n',
+  approach: {
+    chosen: 'Lesezeit beim Lesen im Service berechnen.',
+    rationale: 'Keine Migration nötig.',
+    alternatives: [{ name: 'Feld in der Datenbank', reason: 'braucht eine\nMigration' }],
+  },
+  components: [
+    { name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body: string): number', dependsOn: [] },
+    { name: 'articleService', purpose: 'liefert Artikel', interface: 'getArticle(slug)', dependsOn: ['readingTime', 'articleStore'] },
+  ],
+  dataFlow: 'Route → Service → readingTime → Antwort.',
+  errorHandling: 'Leerer Text ergibt 1 Minute.',
+  acceptanceCriteria: ['GET /api/articles/:slug enthält readingTimeMinutes.', 'Die Liste enthält das Feld je Artikel.'],
+  tests: 'Unit-Test für readingTime; Route-Test für das Feld.',
+  affectedFiles: [
+    { path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false },
+    { path: 'src/utils/readingTime.js', change: 'Berechnung', isNew: true },
+  ],
+  risks: [{ description: 'Sehr lange Texte', severity: 'low', mitigation: 'Berechnung ist linear' }],
+  openPoints: [{ question: 'Wörter pro Minute für Code-Blöcke?' }],
+}
+
+describe('renderSpec', () => {
+  it('renders front matter and all sections', () => {
+    expect(renderSpec(TICKET, SPEC, [{ question: 'Wo wird die Lesezeit berechnet?', answer: 'Ansatz B: Beim Lesen' }])).toBe(
+      [
+        '---',
+        'ticket: CB-2',
+        'stage: design',
+        'source: examples/tickets/cb-2-lesezeit.md',
+        'intent: docs/work/CB-2/intent.md',
+        '---',
+        '',
+        '# CB-2: Lesezeit in der Artikel-API',
+        '',
+        '## Ziel',
+        '',
+        'Die Artikel-API liefert eine geschätzte Lesezeit.',
+        'Sie gilt für Liste und Einzelansicht.',
+        '',
+        '## Gewählter Ansatz',
+        '',
+        'Lesezeit beim Lesen im Service berechnen.',
+        '',
+        '**Begründung:** Keine Migration nötig.',
+        '',
+        '**Verworfene Alternativen:**',
+        '',
+        '- **Feld in der Datenbank** — braucht eine Migration',
+        '',
+        '## Architektur und Komponenten',
+        '',
+        '### readingTime',
+        '',
+        '- **Zweck:** berechnet Minuten',
+        '- **Schnittstelle:** readingTime(body: string): number',
+        '- **Abhängigkeiten:** Keine.',
+        '',
+        '### articleService',
+        '',
+        '- **Zweck:** liefert Artikel',
+        '- **Schnittstelle:** getArticle(slug)',
+        '- **Abhängigkeiten:** readingTime, articleStore',
+        '',
+        '## Datenfluss',
+        '',
+        'Route → Service → readingTime → Antwort.',
+        '',
+        '## Fehlerbehandlung',
+        '',
+        'Leerer Text ergibt 1 Minute.',
+        '',
+        '## Akzeptanzkriterien',
+        '',
+        '- GET /api/articles/:slug enthält readingTimeMinutes.',
+        '- Die Liste enthält das Feld je Artikel.',
+        '',
+        '## Tests',
+        '',
+        'Unit-Test für readingTime; Route-Test für das Feld.',
+        '',
+        '## Betroffene Dateien',
+        '',
+        '- `src/services/articleService.js` — Feld ergänzen',
+        '- `src/utils/readingTime.js` (neu) — Berechnung',
+        '',
+        '## Risiken',
+        '',
+        '- [niedrig] Sehr lange Texte — Berechnung ist linear',
+        '',
+        '## Offene Punkte',
+        '',
+        '- Wörter pro Minute für Code-Blöcke?',
+        '',
+        '## Geklärte Rückfragen',
+        '',
+        '**F:** Wo wird die Lesezeit berechnet?\\',
+        '**A:** Ansatz B: Beim Lesen',
+        '',
+      ].join('\n'),
+    )
+  })
+
+  it('writes "Keine." for empty lists and empty text sections', () => {
+    const md = renderSpec(TICKET, {
+      ...SPEC,
+      approach: { ...SPEC.approach, alternatives: [] },
+      components: [], dataFlow: '  ', errorHandling: '', tests: '\n', affectedFiles: [], risks: [], openPoints: [],
+    }, [])
+    expect(md).toContain('**Verworfene Alternativen:**\n\nKeine.\n')
+    for (const section of ['Architektur und Komponenten', 'Datenfluss', 'Fehlerbehandlung', 'Tests', 'Betroffene Dateien', 'Risiken', 'Offene Punkte', 'Geklärte Rückfragen']) {
+      expect(md).toContain(`## ${section}\n\nKeine.\n`)
+    }
+  })
+
+  it('keeps single-line fields on one line and labels every severity', () => {
+    const md = renderSpec(TICKET, {
+      ...SPEC,
+      title: 'Lese\nzeit',
+      components: [{ name: 'read\nTime', purpose: 'be\nrechnet', interface: 'f(\nx)', dependsOn: ['a\nb'] }],
+      acceptanceCriteria: ['Feld\nvorhanden'],
+      affectedFiles: [{ path: 'src/a.js', change: 'neu\nschreiben', isNew: false }],
+      risks: [
+        { description: 'A\nB', severity: 'high', mitigation: 'C\nD' },
+        { description: 'E', severity: 'medium', mitigation: 'F' },
+      ],
+    }, [{ question: 'Frage\nzwei?', answer: 'Ja,\nklar.' }])
+    expect(md).toContain('# CB-2: Lese zeit\n')
+    expect(md).toContain('### read Time\n\n- **Zweck:** be rechnet\n- **Schnittstelle:** f( x)\n- **Abhängigkeiten:** a b\n')
+    expect(md).toContain('## Akzeptanzkriterien\n\n- Feld vorhanden\n')
+    expect(md).toContain('- `src/a.js` — neu schreiben\n')
+    expect(md).toContain('## Risiken\n\n- [hoch] A B — C D\n- [mittel] E — F\n')
+    expect(md).toContain('**F:** Frage zwei?\\\n**A:** Ja, klar.')
+  })
+})
+
+describe('renderPullRequestBody — design', () => {
+  it('names the spec and uses the goal as summary', () => {
+    expect(renderPullRequestBody(TICKET, 'design', SPEC.goal)).toBe(
+      [
+        '**CB-2: Spec** für „Lesezeit bei Artikeln anzeigen“',
+        '',
+        'Die Artikel-API liefert eine geschätzte Lesezeit.',
+        'Sie gilt für Liste und Einzelansicht.',
+        '',
+        'Quelle: `examples/tickets/cb-2-lesezeit.md`',
+        '',
+        '---',
+        'Merge = Freigabe dieser Stufe. Schließen ohne Merge setzt das Ticket in der App auf „bereit“ zurück.',
+      ].join('\n'),
+    )
+  })
+})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core src/domain/render.test.ts
```

Erwartet: FAIL — `TypeError: renderSpec is not a function` in allen `renderSpec`-Tests; der neue `renderPullRequestBody — design`-Test ist bereits grün.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/domain/render.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,6 @@
-import type { Intent } from '@refinement/shared'
+import type { Intent, Spec } from '@refinement/shared'
 import type { ArtifactStage, QAPair, Ticket } from './types'
-import { artifactTitle } from './artifacts'
+import { artifactPath, artifactTitle } from './artifacts'
 
 const NONE = 'Keine.'
 
@@ -11,6 +11,11 @@ function bulletList(items: string[]): string {
   return items.length ? items.map((item) => `- ${oneLine(item)}`).join('\n') : NONE
 }
 
+/** A multi-line text field: trimmed, `Keine.` when empty. */
+function textBlock(text: string): string {
+  return text.trim() || NONE
+}
+
 function qaList(pairs: QAPair[]): string {
   return pairs.length ? pairs.map((p) => `**F:** ${oneLine(p.question)}\\\n**A:** ${oneLine(p.answer)}`).join('\n\n') : NONE
 }
@@ -56,6 +61,101 @@ export function renderIntent(ticket: Pick<Ticket, 'key' | 'sourcePath'>, intent:
   ].join('\n')
 }
 
+const SEVERITY_LABEL: Record<Spec['risks'][number]['severity'], string> = { high: 'hoch', medium: 'mittel', low: 'niedrig' }
+
+function alternativesList(alternatives: Spec['approach']['alternatives']): string {
+  return bulletList(alternatives.map((alt) => `**${oneLine(alt.name)}** — ${oneLine(alt.reason)}`))
+}
+
+function componentsList(components: Spec['components']): string {
+  if (!components.length) {
+    return NONE
+  }
+  return components.map((component) => [
+    `### ${oneLine(component.name)}`,
+    '',
+    `- **Zweck:** ${oneLine(component.purpose)}`,
+    `- **Schnittstelle:** ${oneLine(component.interface)}`,
+    `- **Abhängigkeiten:** ${component.dependsOn.length ? component.dependsOn.map(oneLine).join(', ') : NONE}`,
+  ].join('\n')).join('\n\n')
+}
+
+function affectedFilesList(files: Spec['affectedFiles']): string {
+  return bulletList(files.map((file) => `\`${oneLine(file.path)}\`${file.isNew ? ' (neu)' : ''} — ${oneLine(file.change)}`))
+}
+
+function risksList(risks: Spec['risks']): string {
+  return bulletList(risks.map((risk) => `[${SEVERITY_LABEL[risk.severity]}] ${oneLine(risk.description)} — ${oneLine(risk.mitigation)}`))
+}
+
+/**
+ * Markdown of `docs/work/<KEY>/spec.md`. The front matter identifies the ticket and the intent it is based on;
+ * state stays in the platform database. Every section is always present; empty ones read „Keine.“.
+ */
+export function renderSpec(ticket: Pick<Ticket, 'key' | 'sourcePath'>, spec: Spec, answeredQuestions: QAPair[]): string {
+  return [
+    '---',
+    `ticket: ${ticket.key}`,
+    'stage: design',
+    `source: ${ticket.sourcePath}`,
+    `intent: ${artifactPath(ticket.key, 'plan')}`,
+    '---',
+    '',
+    `# ${ticket.key}: ${oneLine(spec.title)}`,
+    '',
+    '## Ziel',
+    '',
+    textBlock(spec.goal),
+    '',
+    '## Gewählter Ansatz',
+    '',
+    textBlock(spec.approach.chosen),
+    '',
+    `**Begründung:** ${textBlock(spec.approach.rationale)}`,
+    '',
+    '**Verworfene Alternativen:**',
+    '',
+    alternativesList(spec.approach.alternatives),
+    '',
+    '## Architektur und Komponenten',
+    '',
+    componentsList(spec.components),
+    '',
+    '## Datenfluss',
+    '',
+    textBlock(spec.dataFlow),
+    '',
+    '## Fehlerbehandlung',
+    '',
+    textBlock(spec.errorHandling),
+    '',
+    '## Akzeptanzkriterien',
+    '',
+    bulletList(spec.acceptanceCriteria),
+    '',
+    '## Tests',
+    '',
+    textBlock(spec.tests),
+    '',
+    '## Betroffene Dateien',
+    '',
+    affectedFilesList(spec.affectedFiles),
+    '',
+    '## Risiken',
+    '',
+    risksList(spec.risks),
+    '',
+    '## Offene Punkte',
+    '',
+    bulletList(spec.openPoints.map((p) => p.question)),
+    '',
+    '## Geklärte Rückfragen',
+    '',
+    qaList(answeredQuestions),
+    '',
+  ].join('\n')
+}
+
 /** Description of the stage PR: what it contains and that the merge is the gate. */
 export function renderPullRequestBody(
   ticket: Pick<Ticket, 'key' | 'title' | 'sourcePath'>,
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core src/domain/render.test.ts
npm test && npm run build && npm run lint
```

Erwartet: 8 Tests grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/domain/render.test.ts packages/core/src/domain/render.ts
git commit -m "feat(core): renderSpec für docs/work/<KEY>/spec.md" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 4: Kern: Stufe 2 startbar, Auswahl anbieten, Spec veröffentlichen
**Files:**
- Create: `packages/core/src/application/designStage.test.ts`
- Modify: `packages/core/src/application/executeRun.ts`
- Modify: `packages/core/src/application/stageCommands.test.ts`
- Modify: `packages/core/src/domain/rules.test.ts`
- Modify: `packages/core/src/domain/rules.ts`
- Modify: `packages/core/src/testing/samples.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/intentSchema.ts`
- Create: `packages/shared/src/stageOutput.test.ts`
- Create: `packages/shared/src/stageOutput.ts`

`StageOutputSchema` zieht nach `packages/shared/src/stageOutput.ts` und umfasst jetzt `question | choice | intent | spec`. `executeRun.applyOutput` wird zu einem `switch` über alle vier Typen: `choice` → Log `choice_offered` (Optionen nur mit `id` und `title`) + `awaiting_answer` + `question`-Event; `spec` → `renderSpec` → `publishArtifact` (Branch `<KEY>/spec`, PR `<KEY>: Spec`, Kurzfassung `goal`). `STARTABLE_STAGES` wird `['plan', 'design']`. Der Merge `design → done` ist vorhandene Mechanik (`nextStage`, `syncReviews`) und wird hier per Test abgesichert.

Zwischenstand: Der echte Claude-Adapter kennt `design` erst ab Task 9; bis dahin endet ein manueller Design-Start mit „Für die Stufe design gibt es noch keinen Agent“ (`failed`). Alle Tests laufen mit Fakes und bleiben grün.

Die neuen Use-Case-Tests stehen in einer eigenen Datei `designStage.test.ts`; deren `setup()` legt den Intent schon jetzt auf `showcase` ab, damit sie in Task 5 (Intent wird Pflicht) unverändert grün bleiben.

- [ ] **Step 1: Failing Tests schreiben**

Testdaten für Stufe 2 kommen in `packages/core/src/testing/samples.ts` (Step 3, gehört zu den Test-Doubles).

Neu: `packages/core/src/application/designStage.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
import { startStage, stopRun } from './stageCommands'
import { syncReviews } from './syncReviews'

// Stage 2 (Design) end to end with fakes: start, choice, spec PR, merge → done, stop.

const MODEL = { model: 'claude-sonnet-4-6' }
const INTENT_PATH = 'docs/work/CB-2/intent.md'
const INTENT_MD = '# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien\n\n- Leser sehen die Lesezeit.\n'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** CB-2 in stage design with its merged intent on the base branch; the agent returns the sample spec. */
function setup(): TestContext {
  const ctx = createTestContext()
  seedTicket(ctx, 'CB-2', { title: 'Lesezeit bei Artikeln anzeigen', stage: 'design' })
  ctx.codeHost.files.set(INTENT_PATH, INTENT_MD)
  ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }
  return ctx
}

async function start(ctx: TestContext) {
  startStage(ctx.deps, 'CB-2', MODEL)
  await ctx.settle()
  return ctx.deps.tickets.findByKey('CB-2')!
}

describe('design stage — spec', () => {
  it('writes the spec on its own branch, opens the PR and waits for review', async () => {
    const ctx = setup()

    expect(await start(ctx)).toMatchObject({ stage: 'design', state: 'in_review' })

    const file = ctx.codeHost.branches.get('CB-2/spec')?.get('docs/work/CB-2/spec.md')
    expect(file).toContain('ticket: CB-2\nstage: design\nsource: examples/tickets/cb-2.md\nintent: docs/work/CB-2/intent.md\n')
    expect(file).toContain('# CB-2: Lesezeit in der Artikel-API')
    expect(ctx.codeHost.pulls[0]).toMatchObject({ headBranch: 'CB-2/spec', title: 'CB-2: Spec', state: 'open' })
    expect(ctx.codeHost.pulls[0]?.body).toContain('Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.')
    expect(ctx.deps.artifacts.findOpen('CB-2', 'design')).toMatchObject({ branch: 'CB-2/spec', path: 'docs/work/CB-2/spec.md' })
    expect(ctx.agent.calls[0]).toMatchObject({ stage: 'design', model: 'claude-sonnet-4-6' })
    expect(ctx.store.audit[0]?.payload).toMatchObject({ stage: 'design', trigger: 'initial' })
  })

  it('moves the ticket to done once the spec PR is merged', async () => {
    const ctx = setup()
    await start(ctx)
    ctx.codeHost.merge(ctx.deps.artifacts.findOpen('CB-2', 'design')!.prNumber)

    await syncReviews(ctx.deps)

    expect(ctx.deps.tickets.findByKey('CB-2')).toMatchObject({ stage: 'done', state: 'ready' })
    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'stage_changed', payload: { from: 'design', to: 'done' } })
    expect(ctx.codeHost.files.has('docs/work/CB-2/spec.md')).toBe(true)
  })
})

describe('design stage — choice', () => {
  it('offers the approaches, logs them and waits for the pick', async () => {
    const ctx = setup()
    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }

    expect(await start(ctx)).toMatchObject({ state: 'awaiting_answer' })
    expect(ctx.store.audit.at(-1)).toMatchObject({
      type: 'choice_offered',
      actor: 'agent',
      payload: {
        question: 'Wo wird die Lesezeit berechnet?',
        options: [{ id: 'A', title: 'Beim Speichern' }, { id: 'B', title: 'Beim Lesen' }],
        recommended: 'B',
      },
    })
    expect(ctx.events.published).toContainEqual({ type: 'question', ticketKey: 'CB-2', question: 'Wo wird die Lesezeit berechnet?' })
    expect(ctx.codeHost.pulls).toEqual([])
  })
})

describe('design stage — stop', () => {
  it('stops a running design agent and returns the ticket to ready', async () => {
    const ctx = setup()
    const release = ctx.agent.hold()
    startStage(ctx.deps, 'CB-2', MODEL)
    await vi.waitFor(() => expect(ctx.agent.calls).toHaveLength(1))

    stopRun(ctx.deps, 'CB-2')
    release()
    await ctx.settle()

    expect(ctx.deps.tickets.findByKey('CB-2')).toMatchObject({ stage: 'design', state: 'ready' })
    expect(ctx.store.runs[0]).toMatchObject({ stage: 'design', status: 'failed' })
    expect(ctx.codeHost.pulls).toEqual([])
  })
})
```

Ändern: `packages/core/src/application/stageCommands.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -140,7 +140,7 @@ describe('startStage — rejected', () => {
     seedTicket(ctx, 'CB-1', { state: 'running' })
     seedTicket(ctx, 'CB-2', { state: 'in_review' })
     seedTicket(ctx, 'CB-3', { state: 'awaiting_answer' })
-    seedTicket(ctx, 'CB-4', { stage: 'design' })
+    seedTicket(ctx, 'CB-4', { stage: 'design', state: 'in_review' })
     seedTicket(ctx, 'CB-5', { stage: 'done' })
     seedTicket(ctx, 'CB-6')
```

Ändern: `packages/core/src/domain/rules.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -42,8 +42,10 @@ describe('canStartStage', () => {
     }
   })
 
-  it('rejects design until part B and done always', () => {
-    expect(canStartStage(ticket({ stage: 'design' }))).toBe(false)
+  it('allows design from ready and failed, never done', () => {
+    expect(canStartStage(ticket({ stage: 'design', state: 'ready' }))).toBe(true)
+    expect(canStartStage(ticket({ stage: 'design', state: 'failed' }))).toBe(true)
+    expect(canStartStage(ticket({ stage: 'design', state: 'in_review' }))).toBe(false)
     expect(canStartStage(ticket({ stage: 'done' }))).toBe(false)
   })
 })
```

Neu: `packages/shared/src/stageOutput.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { StageOutputSchema } from './stageOutput'

describe('StageOutputSchema', () => {
  it('accepts the outputs of both stages', () => {
    const intent = { title: 'T', problem: 'P', desiredOutcome: 'O', successCriteria: ['K'], affected: [], openPoints: [] }
    expect(StageOutputSchema.parse({ type: 'question', question: 'Wer?' }).type).toBe('question')
    expect(StageOutputSchema.parse({ type: 'intent', result: intent }).type).toBe('intent')
    const choice = {
      type: 'choice', question: 'Wo?', recommended: 'B',
      options: [{ id: 'A', title: 'a', description: 'd', pros: [], cons: [] }, { id: 'B', title: 'b', description: 'd', pros: [], cons: [] }],
    }
    expect(StageOutputSchema.parse(choice).type).toBe('choice')
  })

  it('rejects unknown output types', () => {
    expect(StageOutputSchema.safeParse({ type: 'refinement', result: {} }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/shared src/stageOutput.test.ts
npx vitest run --root packages/core src/domain/rules.test.ts src/application/designStage.test.ts src/application/stageCommands.test.ts
```

Erwartet: FAIL — `Failed to load url ./stageOutput`; `rules.test.ts` „allows design from ready and failed“ (`expected false to be true`); `designStage.test.ts` schlägt beim Import fehl (`SAMPLE_SPEC_OUTPUT`/`SAMPLE_CHOICE_OUTPUT` fehlen) bzw. `startStage` wirft `CONFLICT` „Stufe kann im Zustand design/ready nicht gestartet werden“.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/application/executeRun.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,6 @@
 import type { AuditPayloads, StageOutput } from '@refinement/shared'
 import type { Ticket } from '../domain/types'
-import { renderIntent } from '../domain/render'
+import { renderIntent, renderSpec } from '../domain/render'
 import { describeError } from '../domain/errors'
 import {
   AgentRunTerminatedError, AgentRunTimeoutError, type AgentRunMeta, type AgentRunnerInput, type RunCompletion,
@@ -32,8 +32,8 @@ interface Attempt {
 }
 
 /**
- * Executes the agent for the attempt's run and applies its outcome: question → `awaiting_answer`,
- * intent → branch + PR → `in_review`. Never throws.
+ * Executes the agent for the attempt's run and applies its outcome: question or choice → `awaiting_answer`,
+ * intent or spec → branch + PR → `in_review`. Never throws.
  * A stop, restart or reset makes the attempt stale while the agent may still answer; late results are discarded.
  */
 export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
@@ -130,19 +130,42 @@ function recordSucceededRun({ deps, ticket, reporter, request }: Attempt, output
   record(deps, ticket.key, 'agent', 'run_finished', { runId: request.runId, status: 'succeeded', ...runMetaPayload(meta) })
 }
 
-/** Question → `awaiting_answer`; intent → rendered Markdown published as branch + PR (`in_review`). */
+/** Question or choice → `awaiting_answer`; intent or spec → rendered Markdown published as branch + PR (`in_review`). */
 async function applyOutput({ deps, ticket, reporter, request }: Attempt, output: StageOutput): Promise<void> {
-  if (output.type === 'question') {
-    record(deps, ticket.key, 'agent', 'question_asked', { question: output.question })
-    reporter.setState('awaiting_answer')
-    reporter.question(output.question)
-    return
+  switch (output.type) {
+    case 'question':
+      record(deps, ticket.key, 'agent', 'question_asked', { question: output.question })
+      awaitAnswer(reporter, output.question)
+      return
+    case 'choice':
+      record(deps, ticket.key, 'agent', 'choice_offered', {
+        question: output.question,
+        options: output.options.map(({ id, title }) => ({ id, title })),
+        recommended: output.recommended,
+      })
+      awaitAnswer(reporter, output.question)
+      return
+    case 'intent':
+      reporter.progress('Intent wird als Pull Request angelegt…')
+      await publishArtifact(deps, ticket, request.stage, {
+        markdown: renderIntent(ticket, output.result, request.answeredQuestions),
+        summary: output.result.problem,
+      }, request.runId)
+      return
+    case 'spec':
+      reporter.progress('Spec wird als Pull Request angelegt…')
+      await publishArtifact(deps, ticket, request.stage, {
+        markdown: renderSpec(ticket, output.result, request.answeredQuestions),
+        summary: output.result.goal,
+      }, request.runId)
+      return
   }
-  reporter.progress('Intent wird als Pull Request angelegt…')
-  await publishArtifact(deps, ticket, request.stage, {
-    markdown: renderIntent(ticket, output.result, request.answeredQuestions),
-    summary: output.result.problem,
-  }, request.runId)
+}
+
+/** The ticket waits for the human; the question event makes open pages reload. */
+function awaitAnswer(reporter: Reporter, question: string): void {
+  reporter.setState('awaiting_answer')
+  reporter.question(question)
 }
 
 /**
```

Ändern: `packages/core/src/domain/rules.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,7 +1,7 @@
 import type { AgentRun, ArtifactStage, QAPair, Stage, Ticket, TicketState } from './types'
 
 /** Stages that can be started; a stage is added once it has an agent (`STAGE_AGENTS` in adapters/claudeCli). */
-export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan']
+export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan', 'design']
 
 const STAGE_ORDER: readonly Stage[] = ['plan', 'design', 'done']
```

Ändern: `packages/core/src/testing/samples.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,4 +1,4 @@
-import type { Intent, IntentAgentOutput } from '@refinement/shared'
+import type { ChoiceOutput, Intent, IntentAgentOutput, Spec, SpecAgentOutput } from '@refinement/shared'
 import type { SourceTicket } from '../domain/types'
 
 // Shared test data: target repository, agent output and usage, source tickets.
@@ -19,6 +19,35 @@ export const SAMPLE_INTENT: Intent = {
 /** Default agent output: `SAMPLE_INTENT` as a stage 1 result. */
 export const SAMPLE_INTENT_OUTPUT: IntentAgentOutput = { type: 'intent', result: SAMPLE_INTENT }
 
+/** Spec of a stage 2 result in tests. */
+export const SAMPLE_SPEC: Spec = {
+  title: 'Lesezeit in der Artikel-API',
+  goal: 'Die Artikel-API liefert zu jedem Artikel eine geschätzte Lesezeit.',
+  approach: { chosen: 'Beim Lesen im Service berechnen.', rationale: 'Keine Migration.', alternatives: [{ name: 'Datenbankfeld', reason: 'Migration nötig' }] },
+  components: [{ name: 'readingTime', purpose: 'berechnet Minuten', interface: 'readingTime(body)', dependsOn: [] }],
+  dataFlow: 'Route → Service → readingTime.',
+  errorHandling: 'Leerer Text ergibt 1 Minute.',
+  acceptanceCriteria: ['Jeder Artikel in der API-Antwort hat readingTimeMinutes.'],
+  tests: 'Unit-Test für readingTime.',
+  affectedFiles: [{ path: 'src/services/articleService.js', change: 'Feld ergänzen', isNew: false }],
+  risks: [],
+  openPoints: [],
+}
+
+/** `SAMPLE_SPEC` as a stage 2 result. */
+export const SAMPLE_SPEC_OUTPUT: SpecAgentOutput = { type: 'spec', result: SAMPLE_SPEC }
+
+/** A stage 2 choice between two approaches; B is recommended. */
+export const SAMPLE_CHOICE_OUTPUT: ChoiceOutput = {
+  type: 'choice',
+  question: 'Wo wird die Lesezeit berechnet?',
+  options: [
+    { id: 'A', title: 'Beim Speichern', description: 'Feld am Artikel.', pros: ['schnell beim Lesen'], cons: ['Migration'] },
+    { id: 'B', title: 'Beim Lesen', description: 'Im Service.', pros: ['keine Migration'], cons: ['Rechenzeit pro Abruf'] },
+  ],
+  recommended: 'B',
+}
+
 /** Default usage of a fake agent run. */
 export const SAMPLE_META = {
   model: 'm', durationSeconds: 1, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 5, costUsd: 0.001,
```

Ändern: `packages/shared/src/index.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -6,8 +6,10 @@ export { SpecSchema, SpecOutputSchema, SpecAgentOutputSchema } from './specSchem
 export type { Spec, SpecAgentOutput } from './specSchema'
 export { StageSchema, ArtifactStageSchema, TicketStateSchema, PrStateSchema } from './stages'
 export type { Stage, ArtifactStage, TicketState, PrState } from './stages'
-export { IntentSchema, IntentOutputSchema, IntentAgentOutputSchema, StageOutputSchema } from './intentSchema'
-export type { Intent, IntentAgentOutput, StageOutput } from './intentSchema'
+export { IntentSchema, IntentOutputSchema, IntentAgentOutputSchema } from './intentSchema'
+export type { Intent, IntentAgentOutput } from './intentSchema'
+export { StageOutputSchema } from './stageOutput'
+export type { StageOutput } from './stageOutput'
 export {
   PullRequestRefSchema,
   StageCostSchema,
```

Ändern: `packages/shared/src/intentSchema.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -28,8 +28,3 @@ export const IntentOutputSchema = z.object({ type: z.literal('intent'), result:
 /** Agent output of stage 1: a blocking question or the intent. */
 export const IntentAgentOutputSchema = z.discriminatedUnion('type', [QuestionOutputSchema, IntentOutputSchema])
 export type IntentAgentOutput = z.infer<typeof IntentAgentOutputSchema>
-
-/** Everything an agent run may return, across all stages. Part B adds the spec output of stage 2. */
-export const StageOutputSchema = IntentAgentOutputSchema
-/** Output of any stage agent; widens with `StageOutputSchema` when stage 2 is added. */
-export type StageOutput = IntentAgentOutput
```

Neu: `packages/shared/src/stageOutput.ts`

```ts
import { z } from 'zod'
import { ChoiceOutputSchema, QuestionOutputSchema } from './agentOutput'
import { IntentOutputSchema } from './intentSchema'
import { SpecOutputSchema } from './specSchema'

/** Everything an agent run may return, across all stages: question, choice (Design), intent (Plan) or spec (Design). */
export const StageOutputSchema = z.discriminatedUnion('type', [
  QuestionOutputSchema,
  ChoiceOutputSchema,
  IntentOutputSchema,
  SpecOutputSchema,
])
/** Output of any stage agent; stored on the AgentRun. */
export type StageOutput = z.infer<typeof StageOutputSchema>
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/shared
npx vitest run --root packages/core src/domain src/application
npm test && npm run build && npm run lint
```

Erwartet: alle genannten Tests grün (u. a. `design stage — spec/choice/stop`); danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/application/designStage.test.ts packages/core/src/application/executeRun.ts packages/core/src/application/stageCommands.test.ts packages/core/src/domain/rules.test.ts packages/core/src/domain/rules.ts packages/core/src/testing/samples.ts packages/shared/src/index.ts packages/shared/src/intentSchema.ts packages/shared/src/stageOutput.test.ts packages/shared/src/stageOutput.ts
git commit -m "feat(core): Stufe 2 startbar — Auswahl anbieten, Spec als PR veröffentlichen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 5: Kern: gemergten Intent von `showcase` lesen
**Files:**
- Modify: `packages/core/src/application/designStage.test.ts`
- Modify: `packages/core/src/application/executeRun.ts`
- Modify: `packages/core/src/application/messages.ts`
- Modify: `packages/core/src/application/runStage.ts`
- Modify: `packages/core/src/ports/agentRunner.ts`

Für `design` liest `runStage` vor dem Klon `codeHost.readFile(artifactPath(key, 'plan'))`. Fehlt die Datei → `failed` mit „Intent fehlt auf showcase — erst Stufe 1 abschließen“; ein GitHub-Fehler → `failed` mit der (deutschen) `CodeHostError`-Meldung. Der Intent geht als `intent` in `AgentRunnerInput` (Port) und von dort in den Prompt (Task 9). Für `plan` wird nichts gelesen. Das bisherige Fehlerende nach `ensureRepo` wird zur Hilfsfunktion `failAttempt`, die beide Fehlerpfade nutzen.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/application/designStage.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,4 +1,5 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
+import { CodeHostError } from '../ports'
 import { SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
 import { startStage, stopRun } from './stageCommands'
 import { syncReviews } from './syncReviews'
@@ -61,6 +62,43 @@ describe('design stage — spec', () => {
   })
 })
 
+describe('design stage — intent', () => {
+  it('passes the merged intent from the base branch to the agent', async () => {
+    const ctx = setup()
+    await start(ctx)
+    expect(ctx.agent.calls[0]?.intent).toBe(INTENT_MD)
+    expect(ctx.codeHost.calls).toContain('readFile')
+  })
+
+  it('fails without intent on the base branch and does not start the agent', async () => {
+    const ctx = setup()
+    ctx.codeHost.files.delete(INTENT_PATH)
+
+    expect(await start(ctx)).toMatchObject({ stage: 'design', state: 'failed' })
+    expect(ctx.store.audit.at(-1)).toMatchObject({ type: 'error', payload: { message: 'Intent fehlt auf showcase — erst Stufe 1 abschließen' } })
+    expect(ctx.store.runs[0]?.status).toBe('failed')
+    expect(ctx.agent.calls).toEqual([])
+    expect(ctx.repos.requestedUrls).toEqual([])
+  })
+
+  it('fails with the GitHub message when the intent cannot be read', async () => {
+    const ctx = setup()
+    ctx.codeHost.failures.readFile = new CodeHostError(0, 'GitHub ist nicht erreichbar')
+
+    expect(await start(ctx)).toMatchObject({ state: 'failed' })
+    expect(ctx.store.audit.at(-1)?.payload).toEqual({ message: 'GitHub ist nicht erreichbar' })
+  })
+
+  it('does not read an intent in the plan stage', async () => {
+    const ctx = createTestContext()
+    seedTicket(ctx, 'CB-3')
+    startStage(ctx.deps, 'CB-3', MODEL)
+    await ctx.settle()
+    expect(ctx.agent.calls[0]?.intent).toBeUndefined()
+    expect(ctx.codeHost.calls).not.toContain('readFile')
+  })
+})
+
 describe('design stage — choice', () => {
   it('offers the approaches, logs them and waits for the pick', async () => {
     const ctx = setup()
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core src/application/designStage.test.ts
```

Erwartet: FAIL — „passes the merged intent …“ (`expected undefined to be '# CB-2: …'`), „fails without intent …“ (Zustand `in_review` statt `failed`), „fails with the GitHub message …“.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/application/executeRun.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -13,12 +13,14 @@ import { failStage } from './failStage'
 import { publishArtifact } from './publishArtifact'
 import { record } from './auditTrail'
 
-/** RunRequest plus what `runStage` prepared: the run id, the checkout and the codebase summary. */
+/** RunRequest plus what `runStage` prepared: the run id, the checkout, the codebase summary and the intent. */
 export interface ExecuteRunRequest extends RunRequest {
   /** The attempt's run, created by `beginRun`. */
   runId: string
   repoDir: string
   codebaseSummary: string | null
+  /** Merged `intent.md` from the base branch; only for the design stage. */
+  intent?: string
 }
 
 /** What one step of an attempt needs: deps, the ticket and its reporter, the request and the staleness check. */
@@ -57,7 +59,7 @@ export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: Exe
   }
 }
 
-/** What the agent gets: ticket text, checkout, model, summary and the Q&A history. */
+/** What the agent gets: ticket text, checkout, model, summary, intent (design) and the Q&A history. */
 function agentInput(ticket: Ticket, request: ExecuteRunRequest): AgentRunnerInput {
   return {
     ticketKey: ticket.key,
@@ -67,6 +69,7 @@ function agentInput(ticket: Ticket, request: ExecuteRunRequest): AgentRunnerInpu
     repoDir: request.repoDir,
     model: request.model,
     codebaseSummary: request.codebaseSummary ?? undefined,
+    intent: request.intent,
     answeredQuestions: request.answeredQuestions,
   }
 }
```

Ändern: `packages/core/src/application/messages.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -3,3 +3,6 @@ export const TOKEN_MISSING = 'GITHUB_TOKEN fehlt — ohne Token kann die App kei
 
 /** Shown when a stage is started or answered (or a second reset requested) while `resetSystem` runs. */
 export const RESET_RUNNING = 'Repo wird gerade zurückgesetzt — bitte kurz warten'
+
+/** Shown when stage 2 starts but `intent.md` is not on the base branch. */
+export const INTENT_MISSING = 'Intent fehlt auf showcase — erst Stufe 1 abschließen'
```

Ändern: `packages/core/src/application/runStage.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,30 +1,39 @@
-import type { Ticket } from '../domain/types'
+import type { ArtifactStage, Ticket } from '../domain/types'
+import { artifactPath } from '../domain/artifacts'
 import type { UseCaseDeps } from './deps'
-import { createReporter } from './reporter'
+import { createReporter, type Reporter } from './reporter'
 import { describeError } from '../domain/errors'
 import { finishRun, isCurrentRun, type RunRequest } from './runLifecycle'
 import { executeRun } from './executeRun'
 import { failStage } from './failStage'
+import { INTENT_MISSING, TOKEN_MISSING } from './messages'
 
 /**
- * Background job of `startStage` and `answerQuestion`: update the clone → codebase summary → agent run.
- * Never throws. Stops early when the ticket was stopped while the clone was prepared.
+ * Background job of `startStage` and `answerQuestion`: read the merged intent (design) → update the clone →
+ * codebase summary → agent run. Never throws. Stops early when the ticket was stopped in between.
  */
 export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: RunRequest & { runId: string }): Promise<void> {
   const reporter = createReporter(deps, ticket.key)
   const { runId } = request
   reporter.log(`Starting stage ${request.stage} (${request.trigger}) for "${ticket.title}"`)
 
+  let intent: string | undefined
+  try {
+    intent = await readIntent(deps, ticket, request.stage, reporter)
+  } catch (err) {
+    failAttempt(deps, reporter, ticket.key, runId, describeError(err))
+    return
+  }
+  if (!stillCurrentOrFinish(deps, ticket.key, runId)) {
+    return
+  }
+
   reporter.progress('Repository wird vorbereitet…')
   let repoDir: string
   try {
     repoDir = await deps.repos.ensureRepo(deps.repoUrl)
   } catch (err) {
-    const current = isCurrentRun(deps, ticket.key, runId)
-    finishRun(deps, ticket.key, runId, 'failed')
-    if (current) {
-      failStage(deps, reporter, ticket.key, `Repository konnte nicht geladen werden. (${describeError(err)})`)
-    }
+    failAttempt(deps, reporter, ticket.key, runId, `Repository konnte nicht geladen werden. (${describeError(err)})`)
     return
   }
 
@@ -41,7 +50,36 @@ export async function runStage(deps: UseCaseDeps, ticket: Ticket, request: RunRe
   }
 
   reporter.progress('Agent wird gestartet…')
-  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary })
+  await executeRun(deps, ticket, { ...request, repoDir, codebaseSummary, intent })
+}
+
+/**
+ * The merged `intent.md` a design run builds on, read from the base branch; undefined for the plan stage.
+ * @throws {Error} with a German message when the intent is missing (stage 1 not merged yet).
+ * @throws {CodeHostError} when GitHub cannot be read.
+ */
+async function readIntent(deps: UseCaseDeps, ticket: Ticket, stage: ArtifactStage, reporter: Reporter): Promise<string | undefined> {
+  if (stage !== 'design') {
+    return undefined
+  }
+  if (!deps.codeHost) {
+    throw new Error(TOKEN_MISSING)
+  }
+  reporter.progress('Intent wird gelesen…')
+  const intent = await deps.codeHost.readFile(artifactPath(ticket.key, 'plan'))
+  if (intent === null) {
+    throw new Error(INTENT_MISSING)
+  }
+  return intent
+}
+
+/** Ends the run as failed; a current attempt also fails the stage with `message` (German, shown on the page). */
+function failAttempt(deps: UseCaseDeps, reporter: Reporter, ticketKey: string, runId: string, message: string): void {
+  const current = isCurrentRun(deps, ticketKey, runId)
+  finishRun(deps, ticketKey, runId, 'failed')
+  if (current) {
+    failStage(deps, reporter, ticketKey, message)
+  }
 }
 
 /**
```

Ändern: `packages/core/src/ports/agentRunner.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,7 +1,7 @@
 import type { StageOutput } from '@refinement/shared'
 import type { ArtifactStage, QAPair } from '../domain/types'
 
-/** Everything one agent run needs: ticket, stage, local checkout, model and the Q&A history. */
+/** Everything one agent run needs: ticket, stage, local checkout, model, intent (design) and the Q&A history. */
 export interface AgentRunnerInput {
   /** Ticket key; also the handle for `stop`. */
   ticketKey: string
@@ -17,6 +17,8 @@ export interface AgentRunnerInput {
   model: string
   /** Summary of the checkout from `RepoProvider.ensureSummary`; absent when it failed. */
   codebaseSummary?: string
+  /** Merged `intent.md` of the ticket, read from the base branch; only for the design stage. */
+  intent?: string
   /** Answered questions of earlier runs of this stage. */
   answeredQuestions: QAPair[]
 }
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core src/application
npm test && npm run build && npm run lint
```

Erwartet: alle Application-Tests grün, inkl. der bestehenden Stop-/Stale-Tests in `stageCommands.test.ts`; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/application/designStage.test.ts packages/core/src/application/executeRun.ts packages/core/src/application/messages.ts packages/core/src/application/runStage.ts packages/core/src/ports/agentRunner.ts
git commit -m "feat(core): Design-Lauf liest den gemergten Intent von showcase" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 6: Kern: höchstens 3 Rückfragen/Auswahlen in Stufe 2
**Files:**
- Modify: `packages/core/src/application/designStage.test.ts`
- Modify: `packages/core/src/application/executeRun.ts`
- Modify: `packages/core/src/application/messages.ts`
- Modify: `packages/core/src/domain/rules.test.ts`
- Modify: `packages/core/src/domain/rules.ts`
- Modify: `packages/core/src/ports/agentRunner.ts`

Reine Funktionen in `domain/rules.ts`: `QUESTION_LIMIT = 3`, `questionLimit(stage)` (nur `design`), `countQuestionsAsked(runs)` (Ausgaben `question`/`choice` ab dem letzten Lauf mit `trigger: 'initial'` — ein Neustart, auch nach `failed`, zählt wieder ab 0) und `questionsRemaining(stage, runs)`. `executeRun` berechnet den Rest vor dem Lauf, gibt ihn als `questionsRemaining` an den Agent (Port-Feld) und beendet die Stufe mit „Rückfragen-Grenze erreicht — der Agent hat keine Spec geliefert“, wenn bei Rest 0 trotzdem eine Rückfrage oder Auswahl kommt (der Lauf selbst bleibt `succeeded`, wie beim PR-Fehler). Stufe 1 bekommt kein Limit (`questionsRemaining` fehlt).

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/application/designStage.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,7 +1,7 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
 import { CodeHostError } from '../ports'
 import { SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
-import { startStage, stopRun } from './stageCommands'
+import { answerQuestion, startStage, stopRun } from './stageCommands'
 import { syncReviews } from './syncReviews'
 
 // Stage 2 (Design) end to end with fakes: start, choice, spec PR, merge → done, stop.
@@ -119,6 +119,58 @@ describe('design stage — choice', () => {
   })
 })
 
+describe('design stage — question limit', () => {
+  const QUESTION = { output: { type: 'question' as const, question: 'Gilt das auch für Entwürfe?' }, meta: SAMPLE_META }
+
+  async function answer(ctx: TestContext, text: string): Promise<void> {
+    answerQuestion(ctx.deps, 'CB-2', { answer: text })
+    await ctx.settle()
+  }
+
+  it('tells the agent how many questions are left and fails when it asks after the third', async () => {
+    const ctx = setup()
+    ctx.agent.outcome = QUESTION
+    await start(ctx)
+    await answer(ctx, 'A1')
+    await answer(ctx, 'A2')
+    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('awaiting_answer')
+
+    await answer(ctx, 'A3')
+
+    expect(ctx.agent.calls.map((call) => call.questionsRemaining)).toEqual([3, 2, 1, 0])
+    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('failed')
+    expect(ctx.store.audit.at(-1)).toMatchObject({
+      type: 'error', payload: { message: 'Rückfragen-Grenze erreicht — der Agent hat keine Spec geliefert' },
+    })
+    expect(ctx.store.audit.filter((e) => e.type === 'question_asked')).toHaveLength(3)
+  })
+
+  it('starts again with the full budget after a stop', async () => {
+    const ctx = setup()
+    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
+    await start(ctx)
+    stopRun(ctx.deps, 'CB-2')
+    ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }
+
+    expect(await start(ctx)).toMatchObject({ state: 'in_review' })
+    expect(ctx.agent.calls.map((call) => call.questionsRemaining)).toEqual([3, 3])
+  })
+
+  it('gives the plan agent no limit', async () => {
+    const ctx = createTestContext()
+    seedTicket(ctx, 'CB-3')
+    ctx.agent.outcome = QUESTION
+    startStage(ctx.deps, 'CB-3', MODEL)
+    await ctx.settle()
+    for (const text of ['A1', 'A2', 'A3', 'A4']) {
+      answerQuestion(ctx.deps, 'CB-3', { answer: text })
+      await ctx.settle()
+    }
+    expect(ctx.deps.tickets.findByKey('CB-3')?.state).toBe('awaiting_answer')
+    expect(ctx.agent.calls.every((call) => call.questionsRemaining === undefined)).toBe(true)
+  })
+})
+
 describe('design stage — stop', () => {
   it('stops a running design agent and returns the ticket to ready', async () => {
     const ctx = setup()
```

Ändern: `packages/core/src/domain/rules.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -4,10 +4,14 @@ import {
   canAnswer,
   canStartStage,
   canStop,
+  countQuestionsAsked,
   currentArtifactStage,
   isStageCompleted,
   nextStage,
   planAnswerRun,
+  QUESTION_LIMIT,
+  questionLimit,
+  questionsRemaining,
   reconcile,
   stageFromRepo,
 } from './rules'
@@ -131,3 +135,50 @@ describe('planAnswerRun', () => {
     expect(planAnswerRun([asked, failed], 'a')).toBeNull()
   })
 })
+
+const CHOICE_OUTPUT = {
+  type: 'choice' as const, question: 'Wo?', recommended: 'A' as const,
+  options: [
+    { id: 'A' as const, title: 'Speichern', description: 'd', pros: [], cons: [] },
+    { id: 'B' as const, title: 'Lesen', description: 'd', pros: [], cons: [] },
+  ],
+}
+
+describe('question limit', () => {
+  it('limits only the design stage', () => {
+    expect(QUESTION_LIMIT).toBe(3)
+    expect(questionLimit('design')).toBe(3)
+    expect(questionLimit('plan')).toBeNull()
+  })
+
+  it('counts questions and choices since the latest start', () => {
+    const runs = [
+      run({ id: 'r1', seq: 1, stage: 'design', output: { type: 'question', question: 'Q0' } }),
+      run({ id: 'r2', seq: 2, stage: 'design', output: null, status: 'failed' }),
+      run({ id: 'r3', seq: 3, stage: 'design', output: { type: 'question', question: 'Q1' } }),
+      run({ id: 'r4', seq: 4, stage: 'design', trigger: 'answer', output: CHOICE_OUTPUT }),
+      run({ id: 'r5', seq: 5, stage: 'design', trigger: 'answer', output: null, status: 'running' }),
+    ]
+    expect(countQuestionsAsked(runs)).toBe(2)
+    expect(countQuestionsAsked(runs.slice(0, 1))).toBe(1)
+    expect(countQuestionsAsked([])).toBe(0)
+  })
+
+  it('counts from 0 after a new start', () => {
+    const runs = [
+      run({ id: 'r1', seq: 1, stage: 'design', output: { type: 'question', question: 'Q1' } }),
+      run({ id: 'r2', seq: 2, stage: 'design', trigger: 'answer', output: CHOICE_OUTPUT }),
+      run({ id: 'r3', seq: 3, stage: 'design', output: null, status: 'running' }),
+    ]
+    expect(countQuestionsAsked(runs)).toBe(0)
+  })
+
+  it('reports the remaining questions, never below 0', () => {
+    const asked = (n: number) => Array.from({ length: n }, (_, i) =>
+      run({ id: `r${i}`, seq: i + 1, stage: 'design', trigger: i === 0 ? 'initial' : 'answer', output: { type: 'question', question: `Q${i}` } }))
+    expect(questionsRemaining('design', [])).toBe(3)
+    expect(questionsRemaining('design', asked(2))).toBe(1)
+    expect(questionsRemaining('design', asked(4))).toBe(0)
+    expect(questionsRemaining('plan', asked(4))).toBeNull()
+  })
+})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core src/domain/rules.test.ts src/application/designStage.test.ts
```

Erwartet: FAIL — `rules.test.ts`: `questionLimit is not a function` u. a.; `designStage.test.ts`: `questionsRemaining` der Aufrufe ist `[undefined, …]` statt `[3, 2, 1, 0]`, der vierte Lauf endet `awaiting_answer` statt `failed`.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/application/executeRun.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -2,6 +2,7 @@ import type { AuditPayloads, StageOutput } from '@refinement/shared'
 import type { Ticket } from '../domain/types'
 import { renderIntent, renderSpec } from '../domain/render'
 import { describeError } from '../domain/errors'
+import { questionsRemaining } from '../domain/rules'
 import {
   AgentRunTerminatedError, AgentRunTimeoutError, type AgentRunMeta, type AgentRunnerInput, type RunCompletion,
   type ToolEvent,
@@ -12,6 +13,7 @@ import { createReporter, type Reporter } from './reporter'
 import { failStage } from './failStage'
 import { publishArtifact } from './publishArtifact'
 import { record } from './auditTrail'
+import { QUESTION_LIMIT_REACHED } from './messages'
 
 /** RunRequest plus what `runStage` prepared: the run id, the checkout, the codebase summary and the intent. */
 export interface ExecuteRunRequest extends RunRequest {
@@ -31,6 +33,8 @@ interface Attempt {
   request: ExecuteRunRequest
   /** True while this attempt is the ticket's current run (see `isCurrentRun`). */
   isCurrent: () => boolean
+  /** Questions and choices the agent may still ask; null for a stage without limit. */
+  questionsRemaining: number | null
 }
 
 /**
@@ -41,10 +45,11 @@ interface Attempt {
 export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: ExecuteRunRequest): Promise<void> {
   const reporter = createReporter(deps, ticket.key)
   const isCurrent = () => isCurrentRun(deps, ticket.key, request.runId)
-  const attempt: Attempt = { deps, ticket, reporter, request, isCurrent }
+  const remaining = questionsRemaining(request.stage, deps.runs.listForTicket(ticket.key, request.stage))
+  const attempt: Attempt = { deps, ticket, reporter, request, isCurrent, questionsRemaining: remaining }
 
   try {
-    const { output, meta } = await deps.agent.run(agentInput(ticket, request), {
+    const { output, meta } = await deps.agent.run(agentInput(ticket, request, remaining), {
       onProgress: reporter.logAndProgress,
       onToolEvent: toolEventRecorder(attempt),
     })
@@ -59,8 +64,8 @@ export async function executeRun(deps: UseCaseDeps, ticket: Ticket, request: Exe
   }
 }
 
-/** What the agent gets: ticket text, checkout, model, summary, intent (design) and the Q&A history. */
-function agentInput(ticket: Ticket, request: ExecuteRunRequest): AgentRunnerInput {
+/** What the agent gets: ticket text, checkout, model, summary, intent (design), the Q&A history and its question budget. */
+function agentInput(ticket: Ticket, request: ExecuteRunRequest, remaining: number | null): AgentRunnerInput {
   return {
     ticketKey: ticket.key,
     stage: request.stage,
@@ -71,6 +76,7 @@ function agentInput(ticket: Ticket, request: ExecuteRunRequest): AgentRunnerInpu
     codebaseSummary: request.codebaseSummary ?? undefined,
     intent: request.intent,
     answeredQuestions: request.answeredQuestions,
+    questionsRemaining: remaining ?? undefined,
   }
 }
 
@@ -133,8 +139,15 @@ function recordSucceededRun({ deps, ticket, reporter, request }: Attempt, output
   record(deps, ticket.key, 'agent', 'run_finished', { runId: request.runId, status: 'succeeded', ...runMetaPayload(meta) })
 }
 
-/** Question or choice → `awaiting_answer`; intent or spec → rendered Markdown published as branch + PR (`in_review`). */
-async function applyOutput({ deps, ticket, reporter, request }: Attempt, output: StageOutput): Promise<void> {
+/**
+ * Question or choice → `awaiting_answer`; intent or spec → rendered Markdown published as branch + PR (`in_review`).
+ * A question or choice after the agent used up its budget fails the stage (it can be started again).
+ */
+async function applyOutput({ deps, ticket, reporter, request, questionsRemaining: remaining }: Attempt, output: StageOutput): Promise<void> {
+  if ((output.type === 'question' || output.type === 'choice') && remaining === 0) {
+    failStage(deps, reporter, ticket.key, QUESTION_LIMIT_REACHED)
+    return
+  }
   switch (output.type) {
     case 'question':
       record(deps, ticket.key, 'agent', 'question_asked', { question: output.question })
```

Ändern: `packages/core/src/application/messages.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -6,3 +6,6 @@ export const RESET_RUNNING = 'Repo wird gerade zurückgesetzt — bitte kurz war
 
 /** Shown when stage 2 starts but `intent.md` is not on the base branch. */
 export const INTENT_MISSING = 'Intent fehlt auf showcase — erst Stufe 1 abschließen'
+
+/** Shown when the design agent asks once more after it used up its questions (`QUESTION_LIMIT`). */
+export const QUESTION_LIMIT_REACHED = 'Rückfragen-Grenze erreicht — der Agent hat keine Spec geliefert'
```

Ändern: `packages/core/src/domain/rules.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -62,6 +62,38 @@ export function reconcile(ticket: Pick<Ticket, 'stage' | 'state'>, repoStage: St
   return { stage: ticket.stage, state: ticket.state }
 }
 
+/** Questions and choices the design agent may ask per stage attempt; stage 1 (Plan) has no limit. */
+export const QUESTION_LIMIT = 3
+
+/** Question limit of a stage: `QUESTION_LIMIT` for design, null (no limit) for plan. */
+export function questionLimit(stage: ArtifactStage): number | null {
+  return stage === 'design' ? QUESTION_LIMIT : null
+}
+
+/**
+ * Questions and choices the agent asked since the stage was last started: outputs of type `question` or `choice`
+ * from the latest `initial` run on. A new start (also after a failure) counts from 0 again.
+ * @param runs - Runs of one ticket and stage in `seq` order.
+ */
+export function countQuestionsAsked(runs: AgentRun[]): number {
+  let start = 0
+  runs.forEach((run, index) => {
+    if (run.trigger === 'initial') {
+      start = index
+    }
+  })
+  return runs.slice(start).filter((run) => run.output?.type === 'question' || run.output?.type === 'choice').length
+}
+
+/**
+ * Questions and choices the agent may still ask in this attempt; null for a stage without limit.
+ * @param runs - Runs of one ticket and stage in `seq` order.
+ */
+export function questionsRemaining(stage: ArtifactStage, runs: AgentRun[]): number | null {
+  const limit = questionLimit(stage)
+  return limit === null ? null : Math.max(0, limit - countQuestionsAsked(runs))
+}
+
 /**
  * Finds the open question and builds the Q&A history for the answer run.
  * Only the latest run counts: a question followed by another run is no longer open.
```

Ändern: `packages/core/src/ports/agentRunner.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -21,6 +21,8 @@ export interface AgentRunnerInput {
   intent?: string
   /** Answered questions of earlier runs of this stage. */
   answeredQuestions: QAPair[]
+  /** Questions and choices the agent may still ask in this attempt; absent for a stage without limit (plan). */
+  questionsRemaining?: number
 }
 
 /** Usage of a run (summed over a schema retry), stored on the AgentRun and shown in the log. */
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core src/domain src/application
npm test && npm run build && npm run lint
```

Erwartet: grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/application/designStage.test.ts packages/core/src/application/executeRun.ts packages/core/src/application/messages.ts packages/core/src/domain/rules.test.ts packages/core/src/domain/rules.ts packages/core/src/ports/agentRunner.ts
git commit -m "feat(core): Grenze von 3 Rückfragen/Auswahlen in Stufe 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 7: Antwort auf eine Auswahl (`{ choice, note? }`)
**Files:**
- Modify: `packages/core/src/application/designStage.test.ts`
- Modify: `packages/core/src/application/stageCommands.ts`
- Modify: `packages/core/src/domain/rules.test.ts`
- Modify: `packages/core/src/domain/rules.ts`
- Modify: `packages/shared/src/api.test.ts`
- Modify: `packages/shared/src/api.ts`

`AnswerInputSchema` wird eine strikte Zod-Union `{ answer }` | `{ choice: 'A'|'B'|'C', note? }` (beide Formen zugleich, unbekannte ids oder leere Eingabe → „Antwort oder Auswahl ist erforderlich“; leere Antwort behält „Antwort ist erforderlich“ — zod 4 meldet bei genau einer passenden Variante deren Fehler). `planAnswerRun(runs, input)` nimmt jetzt die ganze Eingabe, erkennt offene Rückfrage **oder** Auswahl und liefert `answer` (Text für Verlauf und `spec.md`) und `choice`. Passt die Eingabe nicht zur offenen Frage (Auswahl auf Rückfrage, Freitext auf Auswahl, nicht angebotene id), wirft es `ValidationError`. `choiceAnswerText` erzeugt „Ansatz B: <Titel> — Anmerkung: <note>“ (ohne Anmerkung ohne Zusatz). `answerQuestion` loggt `answer_given` mit `choice`, wenn gewählt wurde.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/application/designStage.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,8 @@
 import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
 import { CodeHostError } from '../ports'
-import { SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
+import {
+  SAMPLE_CHOICE_OUTPUT, SAMPLE_META, SAMPLE_SPEC_OUTPUT, createTestContext, errorCodeOf, seedTicket, type TestContext,
+} from '../testing/fakes'
 import { answerQuestion, startStage, stopRun } from './stageCommands'
 import { syncReviews } from './syncReviews'
 
@@ -117,6 +119,34 @@ describe('design stage — choice', () => {
     expect(ctx.events.published).toContainEqual({ type: 'question', ticketKey: 'CB-2', question: 'Wo wird die Lesezeit berechnet?' })
     expect(ctx.codeHost.pulls).toEqual([])
   })
+
+  it('continues with the picked option and documents it in the spec', async () => {
+    const ctx = setup()
+    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
+    await start(ctx)
+    ctx.agent.outcome = { output: SAMPLE_SPEC_OUTPUT, meta: SAMPLE_META }
+
+    answerQuestion(ctx.deps, 'CB-2', { choice: 'A', note: 'Migration ist ok' })
+    await ctx.settle()
+
+    const answer = 'Ansatz A: Beim Speichern — Anmerkung: Migration ist ok'
+    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('in_review')
+    expect(ctx.agent.calls[1]).toMatchObject({ answeredQuestions: [{ question: 'Wo wird die Lesezeit berechnet?', answer }], questionsRemaining: 2 })
+    expect(ctx.store.audit.find((e) => e.type === 'answer_given')).toMatchObject({ actor: 'human', payload: { answer, choice: 'A' } })
+    expect(ctx.codeHost.branches.get('CB-2/spec')?.get('docs/work/CB-2/spec.md')).toContain(`**F:** Wo wird die Lesezeit berechnet?\\\n**A:** ${answer}`)
+  })
+
+  it('rejects an option that was not offered and a free-text answer to a choice', async () => {
+    const ctx = setup()
+    ctx.agent.outcome = { output: SAMPLE_CHOICE_OUTPUT, meta: SAMPLE_META }
+    await start(ctx)
+
+    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { choice: 'C' }))).toBe('VALIDATION')
+    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { answer: 'Beim Lesen' }))).toBe('VALIDATION')
+    expect(errorCodeOf(() => answerQuestion(ctx.deps, 'CB-2', { choice: 'X' }))).toBe('VALIDATION')
+    expect(ctx.deps.tickets.findByKey('CB-2')?.state).toBe('awaiting_answer')
+    expect(ctx.store.audit.map((e) => e.type)).not.toContain('answer_given')
+  })
 })
 
 describe('design stage — question limit', () => {
```

Ändern: `packages/core/src/domain/rules.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,9 +1,11 @@
 import { describe, it, expect } from 'vitest'
 import type { AgentRun, Ticket } from './types'
+import { errorCodeOf } from '../testing/fakes'
 import {
   canAnswer,
   canStartStage,
   canStop,
+  choiceAnswerText,
   countQuestionsAsked,
   currentArtifactStage,
   isStageCompleted,
@@ -34,6 +36,14 @@ function run(patch: Partial<AgentRun>): AgentRun {
   }
 }
 
+const CHOICE_OUTPUT = {
+  type: 'choice' as const, question: 'Wo?', recommended: 'A' as const,
+  options: [
+    { id: 'A' as const, title: 'Speichern', description: 'd', pros: [], cons: [] },
+    { id: 'B' as const, title: 'Lesen', description: 'd', pros: [], cons: [] },
+  ],
+}
+
 describe('canStartStage', () => {
   it('allows plan from ready and failed', () => {
     expect(canStartStage(ticket({ state: 'ready' }))).toBe(true)
@@ -115,7 +125,7 @@ describe('reconcile', () => {
 
 describe('planAnswerRun', () => {
   it('returns null without a question', () => {
-    expect(planAnswerRun([run({ output: null })], 'a')).toBeNull()
+    expect(planAnswerRun([run({ output: null })], { answer: 'a' })).toBeNull()
   })
 
   it('appends the answer to the history of the question run', () => {
@@ -124,25 +134,35 @@ describe('planAnswerRun', () => {
       id: 'r2', seq: 2, trigger: 'answer', output: { type: 'question', question: 'Q2' },
       input: { model: 'm', answeredQuestions: [{ question: 'Q1', answer: 'A1' }] },
     })
-    const plan = planAnswerRun([first, second], 'A2')
+    const plan = planAnswerRun([first, second], { answer: 'A2' })
     expect(plan?.questionRun.id).toBe('r2')
     expect(plan?.answeredQuestions).toEqual([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }])
+    expect(plan?.answer).toBe('A2')
+    expect(plan?.choice).toBeUndefined()
   })
 
   it('ignores a question that was followed by a later run', () => {
     const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
     const failed = run({ id: 'r2', seq: 2, output: null, status: 'failed' })
-    expect(planAnswerRun([asked, failed], 'a')).toBeNull()
+    expect(planAnswerRun([asked, failed], { answer: 'a' })).toBeNull()
   })
-})
 
-const CHOICE_OUTPUT = {
-  type: 'choice' as const, question: 'Wo?', recommended: 'A' as const,
-  options: [
-    { id: 'A' as const, title: 'Speichern', description: 'd', pros: [], cons: [] },
-    { id: 'B' as const, title: 'Lesen', description: 'd', pros: [], cons: [] },
-  ],
-}
+  it('turns a picked option into the answer text of the history', () => {
+    const offered = run({ id: 'r1', seq: 1, stage: 'design', output: CHOICE_OUTPUT })
+    const plan = planAnswerRun([offered], { choice: 'B', note: 'ohne Cache' })
+    expect(plan?.answeredQuestions).toEqual([{ question: 'Wo?', answer: 'Ansatz B: Lesen — Anmerkung: ohne Cache' }])
+    expect(plan?.choice).toBe('B')
+  })
+
+  it('rejects input that does not fit the open question', () => {
+    const asked = run({ id: 'r1', seq: 1, output: { type: 'question', question: 'Q1' } })
+    const offered = run({ id: 'r1', seq: 1, stage: 'design', output: CHOICE_OUTPUT })
+    expect(() => planAnswerRun([asked], { choice: 'A' })).toThrow('erwartet eine Antwort, keine Auswahl')
+    expect(() => planAnswerRun([offered], { answer: 'Lesen' })).toThrow('Bitte einen der angebotenen Ansätze wählen')
+    expect(() => planAnswerRun([offered], { choice: 'C' })).toThrow('Ansatz C wurde nicht angeboten')
+    expect(errorCodeOf(() => planAnswerRun([offered], { choice: 'C' }))).toBe('VALIDATION')
+  })
+})
 
 describe('question limit', () => {
   it('limits only the design stage', () => {
@@ -182,3 +202,11 @@ describe('question limit', () => {
     expect(questionsRemaining('plan', asked(4))).toBeNull()
   })
 })
+
+describe('choiceAnswerText', () => {
+  it('names the option and adds the note only when given', () => {
+    expect(choiceAnswerText({ id: 'B', title: 'Beim Lesen berechnen' })).toBe('Ansatz B: Beim Lesen berechnen')
+    expect(choiceAnswerText({ id: 'B', title: 'Beim Lesen berechnen' }, ' ohne Cache ')).toBe('Ansatz B: Beim Lesen berechnen — Anmerkung: ohne Cache')
+    expect(choiceAnswerText({ id: 'A', title: 'Speichern' }, '   ')).toBe('Ansatz A: Speichern')
+  })
+})
```

Ändern: `packages/shared/src/api.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -64,7 +64,18 @@ describe('inputs', () => {
   })
 
   it('AnswerInputSchema rejects blank answers', () => {
-    expect(AnswerInputSchema.safeParse({ answer: '  ' }).success).toBe(false)
+    expect(AnswerInputSchema.safeParse({ answer: '  ' }).error?.issues.map((issue) => issue.message)).toEqual(['Antwort ist erforderlich'])
+  })
+
+  it('AnswerInputSchema accepts a picked option with or without a note', () => {
+    expect(AnswerInputSchema.parse({ choice: 'B' })).toEqual({ choice: 'B' })
+    expect(AnswerInputSchema.parse({ choice: 'A', note: 'ohne Cache' })).toEqual({ choice: 'A', note: 'ohne Cache' })
+  })
+
+  it('AnswerInputSchema rejects unknown ids, both shapes at once and empty input with a German message', () => {
+    for (const input of [{ choice: 'D' }, { answer: 'x', choice: 'A' }, {}]) {
+      expect(AnswerInputSchema.safeParse(input).error?.issues.map((issue) => issue.message)).toEqual(['Antwort oder Auswahl ist erforderlich'])
+    }
   })
 })
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/shared src/api.test.ts
npx vitest run --root packages/core src/domain/rules.test.ts src/application/designStage.test.ts
```

Erwartet: FAIL — `AnswerInputSchema` lehnt `{ choice: 'B' }` ab; `choiceAnswerText is not a function`; `planAnswerRun` mit `{ answer }` statt String; in `designStage.test.ts` endet `answerQuestion(… { choice: 'A' … })` mit `VALIDATION` bzw. „Keine offene Rückfrage gefunden“.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/application/stageCommands.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -37,8 +37,10 @@ export function startStage(deps: UseCaseDeps, key: string, raw: unknown): void {
 }
 
 /**
- * Continues the stage with the answer in a new run (same model, full Q&A history). Returns immediately.
- * The ticket is `running` right away, so a second answer is rejected.
+ * Continues the stage with the answer (`{ answer }`) or the picked option of a choice (`{ choice, note? }`) in a new
+ * run (same model, full Q&A history). Returns immediately. The ticket is `running` right away, so a second answer
+ * is rejected.
+ * @throws {ValidationError} when the input is invalid or does not fit the open question (see `planAnswerRun`).
  */
 export function answerQuestion(deps: UseCaseDeps, key: string, raw: unknown): void {
   rejectDuringReset(deps)
@@ -50,13 +52,13 @@ export function answerQuestion(deps: UseCaseDeps, key: string, raw: unknown): vo
   if (!deps.codeHost) {
     throw new ConflictError(TOKEN_MISSING)
   }
-  const { answer } = parseInput(AnswerInputSchema, raw)
-  const plan = planAnswerRun(deps.runs.listForTicket(ticket.key, stage), answer)
+  const input = parseInput(AnswerInputSchema, raw)
+  const plan = planAnswerRun(deps.runs.listForTicket(ticket.key, stage), input)
   if (!plan) {
     throw new ConflictError('Keine offene Rückfrage gefunden')
   }
 
-  record(deps, ticket.key, 'human', 'answer_given', { answer })
+  record(deps, ticket.key, 'human', 'answer_given', plan.choice ? { answer: plan.answer, choice: plan.choice } : { answer: plan.answer })
   createReporter(deps, ticket.key).setState('running')
   const request: RunRequest = { stage, trigger: 'answer', model: plan.questionRun.input.model, answeredQuestions: plan.answeredQuestions }
   deps.runInBackground(runStage(deps, ticket, { ...request, runId: beginRun(deps, ticket, request) }))
```

Ändern: `packages/core/src/domain/rules.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,4 +1,6 @@
+import type { AnswerInput, ChoiceId, ChoiceOption, ChoiceOutput, QuestionOutput } from '@refinement/shared'
 import type { AgentRun, ArtifactStage, QAPair, Stage, Ticket, TicketState } from './types'
+import { ValidationError } from './errors'
 
 /** Stages that can be started; a stage is added once it has an agent (`STAGE_AGENTS` in adapters/claudeCli). */
 export const STARTABLE_STAGES: readonly ArtifactStage[] = ['plan', 'design']
@@ -94,20 +96,59 @@ export function questionsRemaining(stage: ArtifactStage, runs: AgentRun[]): numb
   return limit === null ? null : Math.max(0, limit - countQuestionsAsked(runs))
 }
 
+/** Answer text of a picked option as the next run and `spec.md` see it: `Ansatz B: <Titel> — Anmerkung: <note>`. */
+export function choiceAnswerText(option: Pick<ChoiceOption, 'id' | 'title'>, note?: string): string {
+  const base = `Ansatz ${option.id}: ${option.title.trim()}`
+  const trimmedNote = note?.trim()
+  return trimmedNote ? `${base} — Anmerkung: ${trimmedNote}` : base
+}
+
+/** What `answerQuestion` continues with: the run that asked, the new Q&A history and the logged answer. */
+export interface AnswerPlan {
+  /** The latest run of the stage; its output is the open question or choice. */
+  questionRun: AgentRun
+  /** Q&A history of the question run plus the new answer. */
+  answeredQuestions: QAPair[]
+  /** Answer text as the next run and the artifact see it. */
+  answer: string
+  /** Picked option when the open question was a choice. */
+  choice?: ChoiceId
+}
+
 /**
- * Finds the open question and builds the Q&A history for the answer run.
+ * Finds the open question or choice and builds the Q&A history for the answer run.
  * Only the latest run counts: a question followed by another run is no longer open.
- * @param runs   - Runs of one ticket and stage in `seq` order.
- * @param answer - The human's answer to the open question.
+ * @param runs  - Runs of one ticket and stage in `seq` order.
+ * @param input - The human's answer (`{ answer }`) or pick (`{ choice, note? }`).
+ * @returns null when nothing is open.
+ * @throws {ValidationError} when the input does not fit the open question (answer for a choice, pick for a question,
+ *   id that was not offered).
  */
-export function planAnswerRun(
-  runs: AgentRun[],
-  answer: string,
-): { questionRun: AgentRun; answeredQuestions: QAPair[] } | null {
+export function planAnswerRun(runs: AgentRun[], input: AnswerInput): AnswerPlan | null {
   const latest = runs[runs.length - 1]
   const output = latest?.output
-  if (!latest || output?.type !== 'question') {
+  if (!latest || (output?.type !== 'question' && output?.type !== 'choice')) {
     return null
   }
-  return { questionRun: latest, answeredQuestions: [...latest.input.answeredQuestions, { question: output.question, answer }] }
+  const { answer, choice } = answerFor(output, input)
+  const answeredQuestions = [...latest.input.answeredQuestions, { question: output.question, answer }]
+  return choice ? { questionRun: latest, answeredQuestions, answer, choice } : { questionRun: latest, answeredQuestions, answer }
+}
+
+/** Answer text (and picked id) for the open question or choice. @throws {ValidationError} */
+function answerFor(output: QuestionOutput | ChoiceOutput, input: AnswerInput): { answer: string; choice?: ChoiceId } {
+  if (output.type === 'question') {
+    if (!('answer' in input)) {
+      throw new ValidationError('Die offene Rückfrage erwartet eine Antwort, keine Auswahl')
+    }
+    return { answer: input.answer }
+  }
+  if (!('choice' in input)) {
+    throw new ValidationError('Bitte einen der angebotenen Ansätze wählen')
+  }
+  const option = output.options.find((candidate) => candidate.id === input.choice)
+  if (!option) {
+    throw new ValidationError(`Ansatz ${input.choice} wurde nicht angeboten`)
+  }
+  return { answer: choiceAnswerText(option, input.note), choice: option.id }
 }
```

Ändern: `packages/shared/src/api.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,7 @@
 import { z } from 'zod'
 import { ArtifactStageSchema, PrStateSchema, StageSchema, TicketStateSchema } from './stages'
 import { AuditActorSchema } from './auditEvents'
+import { ChoiceIdSchema } from './agentOutput'
 
 const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)
 
@@ -132,8 +133,12 @@ export const StartStageInputSchema = z.object({
 })
 export type StartStageInput = z.infer<typeof StartStageInputSchema>
 
-/** Input of `answerQuestion`: the human's answer to the open question. */
-export const AnswerInputSchema = z.object({
-  answer: notBlank('Antwort ist erforderlich'),
-})
+/**
+ * Input of `answerQuestion`: a free-text answer to an open question, or the id of the picked option of an open
+ * choice with an optional note. Exactly one of both shapes; extra keys are rejected.
+ */
+export const AnswerInputSchema = z.union([
+  z.object({ answer: notBlank('Antwort ist erforderlich') }).strict(),
+  z.object({ choice: ChoiceIdSchema, note: z.string().optional() }).strict(),
+], { error: 'Antwort oder Auswahl ist erforderlich' })
 export type AnswerInput = z.infer<typeof AnswerInputSchema>
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/shared
npx vitest run --root packages/core src/domain src/application
npm test && npm run build && npm run lint
```

Erwartet: grün (der bestehende Test „rejects … blank answers“ bleibt `VALIDATION`); danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/application/designStage.test.ts packages/core/src/application/stageCommands.ts packages/core/src/domain/rules.test.ts packages/core/src/domain/rules.ts packages/shared/src/api.test.ts packages/shared/src/api.ts
git commit -m "feat(core): Antwort auf eine Auswahl mit optionaler Anmerkung" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 8: Ticketseite: offene Auswahl und Zähler im DTO
**Files:**
- Modify: `apps/web/test/fixtures.ts`
- Modify: `packages/core/src/application/queries.test.ts`
- Modify: `packages/core/src/application/queries.ts`
- Modify: `packages/shared/src/api.test.ts`
- Modify: `packages/shared/src/api.ts`

`TicketDetailDto` bekommt `pendingChoice` (Auswahl ohne `type`, `PendingChoiceSchema`), `questionsAsked` und `questionLimit` der aktuellen Stufe. `queries.ts` ersetzt `pendingQuestion()` durch `questionState()`. Die Web-Fixture `aTicketDetail` bekommt die neuen Pflichtfelder im selben Task, sonst bricht der Typcheck von `apps/web`.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/application/queries.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,6 +1,6 @@
 import { describe, it, expect, vi, afterEach } from 'vitest'
 import { CodeHostError } from '../ports'
-import { createTestContext, seedTicket, type TestContext } from '../testing/fakes'
+import { SAMPLE_CHOICE_OUTPUT, createTestContext, seedTicket, type TestContext } from '../testing/fakes'
 import { getSettings, getTicket, listTickets } from './queries'
 
 afterEach(() => {
@@ -144,7 +144,30 @@ describe('getTicket', () => {
   it('has no open question outside awaiting_answer', async () => {
     const ctx = createTestContext()
     seedTicket(ctx, 'CB-1')
-    expect((await getTicket(ctx.deps, 'CB-1')).pendingQuestion).toBeNull()
+    expect(await getTicket(ctx.deps, 'CB-1')).toMatchObject({ pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null })
+  })
+
+  it('returns an open choice of stage 2 and counts the questions of the attempt', async () => {
+    const ctx = createTestContext()
+    seedTicket(ctx, 'CB-1', { stage: 'design', state: 'awaiting_answer' })
+    const usage = { costUsd: 0, inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0 }
+    const first = ctx.deps.runs.create({ ticketKey: 'CB-1', stage: 'design', trigger: 'initial', model: 'm', input: { model: 'm', answeredQuestions: [] } })
+    ctx.deps.runs.complete(first.id, { output: { type: 'question', question: 'Wer?' }, ...usage })
+    const second = ctx.deps.runs.create({
+      ticketKey: 'CB-1', stage: 'design', trigger: 'answer', model: 'm', input: { model: 'm', answeredQuestions: [{ question: 'Wer?', answer: 'Alle' }] },
+    })
+    ctx.deps.runs.complete(second.id, { output: SAMPLE_CHOICE_OUTPUT, ...usage })
+
+    const detail = await getTicket(ctx.deps, 'CB-1')
+
+    const { type: _type, ...pendingChoice } = SAMPLE_CHOICE_OUTPUT
+    expect(detail).toMatchObject({ pendingQuestion: null, pendingChoice, questionsAsked: 2, questionLimit: 3 })
+  })
+
+  it('has no counter once the ticket is done', async () => {
+    const ctx = createTestContext()
+    seedTicket(ctx, 'CB-1', { stage: 'done' })
+    expect(await getTicket(ctx.deps, 'CB-1')).toMatchObject({ pendingChoice: null, questionsAsked: 0, questionLimit: null })
   })
 
   it('accepts lower-case keys and reports unknown ones', async () => {
```

Ändern: `packages/shared/src/api.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -50,11 +50,27 @@ describe('TicketDetailSchema', () => {
       }],
       log: [{ actor: 'agent', type: 'question_asked', payload: { question: 'Wer?' }, createdAt: NOW }],
       pendingQuestion: 'Wer?',
+      pendingChoice: null,
+      questionsAsked: 1,
+      questionLimit: null,
       costs: COSTS,
     })
     expect(detail.pendingQuestion).toBe('Wer?')
     expect(detail.stages[0]?.stage).toBe('plan')
   })
+
+  it('accepts a pending choice with the question counter of stage 2', () => {
+    const pendingChoice = {
+      question: 'Wo?', recommended: 'B',
+      options: [{ id: 'A', title: 'a', description: 'd', pros: [], cons: [] }, { id: 'B', title: 'b', description: 'd', pros: ['+'], cons: [] }],
+    }
+    const detail = TicketDetailSchema.parse({
+      ...TICKET, stage: 'design', state: 'awaiting_answer', stages: [], log: [], costs: COSTS,
+      pendingQuestion: null, pendingChoice, questionsAsked: 2, questionLimit: 3,
+    })
+    expect(detail.pendingChoice?.recommended).toBe('B')
+    expect(TicketDetailSchema.safeParse({ ...detail, pendingChoice: { ...pendingChoice, recommended: 'C' } }).success).toBe(false)
+  })
 })
 
 describe('inputs', () => {
@@ -92,6 +108,8 @@ describe('CostSummarySchema', () => {
   it('is required on the ticket page and the board ticket', () => {
     const { totalCostUsd: _omit, ...withoutTotal } = TICKET
     expect(TicketSchema.safeParse(withoutTotal).success).toBe(false)
-    expect(TicketDetailSchema.safeParse({ ...TICKET, stages: [], log: [], pendingQuestion: null }).success).toBe(false)
+    expect(TicketDetailSchema.safeParse({
+      ...TICKET, stages: [], log: [], pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null,
+    }).success).toBe(false)
   })
 })
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/shared src/api.test.ts
npx vitest run --root packages/core src/application/queries.test.ts
```

Erwartet: FAIL — `detail.pendingChoice` ist `undefined` (Zod verwirft unbekannte Schlüssel), `getTicket` liefert kein `pendingChoice`/`questionsAsked`/`questionLimit`.

- [ ] **Step 3: Implementieren**

Ändern: `apps/web/test/fixtures.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -22,9 +22,12 @@ export function aCostSummary(patch: Partial<CostSummaryDto> = {}): CostSummaryDt
   }
 }
 
-/** `aTicket` plus the detail fields of the ticket page: no stages, empty log, no open question, no cost. */
+/** `aTicket` plus the detail fields of the ticket page: no stages, empty log, no open question or choice, no cost. */
 export function aTicketDetail(patch: Partial<TicketDetailDto> = {}): TicketDetailDto {
-  return { ...aTicket(patch), stages: [], log: [], pendingQuestion: null, costs: aCostSummary(), ...patch }
+  return {
+    ...aTicket(patch), stages: [], log: [], pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null,
+    costs: aCostSummary(), ...patch,
+  }
 }
 
 /** One log entry of the ticket page, written by `actor` (system by default). */
```

Ändern: `packages/core/src/application/queries.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -3,7 +3,7 @@ import type { Artifact, ArtifactStage, Ticket } from '../domain/types'
 import { summarizeCosts } from '../domain/costs'
 import type { AuditLogEntry } from '../ports'
 import { ARTIFACT_STAGES, artifactPath, fileUrl } from '../domain/artifacts'
-import { currentArtifactStage, isStageCompleted } from '../domain/rules'
+import { countQuestionsAsked, currentArtifactStage, isStageCompleted, questionLimit } from '../domain/rules'
 import type { UseCaseDeps } from './deps'
 import { toAuditLogEntryDto, toPullRequestRef, toTicketDto } from './dto'
 import { describeError } from '../domain/errors'
@@ -58,18 +58,30 @@ async function stageView(deps: UseCaseDeps, ticket: Ticket, artifacts: Artifact[
   }
 }
 
-/** The agent's question while the ticket waits for an answer. */
-function pendingQuestion(deps: UseCaseDeps, ticket: Ticket): string | null {
+/** Open question or choice and the question counter of the current stage, as the ticket page shows them. */
+type QuestionState = Pick<TicketDetailDto, 'pendingQuestion' | 'pendingChoice' | 'questionsAsked' | 'questionLimit'>
+
+/** The agent's open question or choice while the ticket waits for an answer, and how many it asked so far. */
+function questionState(deps: UseCaseDeps, ticket: Ticket): QuestionState {
   const stage = currentArtifactStage(ticket)
-  if (ticket.state !== 'awaiting_answer' || !stage) {
-    return null
+  if (!stage) {
+    return { pendingQuestion: null, pendingChoice: null, questionsAsked: 0, questionLimit: null }
+  }
+  const runs = deps.runs.listForTicket(ticket.key, stage)
+  const output = ticket.state === 'awaiting_answer' ? runs.at(-1)?.output : undefined
+  return {
+    pendingQuestion: output?.type === 'question' ? output.question : null,
+    pendingChoice: output?.type === 'choice'
+      ? { question: output.question, options: output.options, recommended: output.recommended }
+      : null,
+    questionsAsked: countQuestionsAsked(runs),
+    questionLimit: questionLimit(stage),
   }
-  const output = deps.runs.listForTicket(ticket.key, stage).at(-1)?.output
-  return output?.type === 'question' ? output.question : null
 }
 
 /**
- * Ticket page data: stages (merged content read live), log, open question and agent cost per stage.
+ * Ticket page data: stages (merged content read live), log, open question or choice with the question counter,
+ * and agent cost per stage.
  * @throws {NotFoundError}
  */
 export async function getTicket(deps: UseCaseDeps, key: string): Promise<TicketDetailDto> {
@@ -81,7 +93,7 @@ export async function getTicket(deps: UseCaseDeps, key: string): Promise<TicketD
     ...toTicketDto(ticket, openArtifact(deps, ticket), costs.totalUsd),
     stages: await Promise.all(ARTIFACT_STAGES.map((stage) => stageView(deps, ticket, artifacts, stage))),
     log: log.map(toAuditLogEntryDto),
-    pendingQuestion: pendingQuestion(deps, ticket),
+    ...questionState(deps, ticket),
     costs,
   }
 }
```

Ändern: `packages/shared/src/api.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,7 +1,7 @@
 import { z } from 'zod'
 import { ArtifactStageSchema, PrStateSchema, StageSchema, TicketStateSchema } from './stages'
 import { AuditActorSchema } from './auditEvents'
-import { ChoiceIdSchema } from './agentOutput'
+import { ChoiceIdSchema, PendingChoiceSchema } from './agentOutput'
 
 const notBlank = (message: string) => z.string().refine((value) => value.trim().length > 0, message)
 
@@ -101,14 +101,20 @@ export const AuditLogEntrySchema = z.object({
 })
 export type AuditLogEntryDto = z.infer<typeof AuditLogEntrySchema>
 
-/** Everything the ticket page shows: the ticket, its stages, its log and an open question. */
+/** Everything the ticket page shows: the ticket, its stages, its log and an open question or choice. */
 export const TicketDetailSchema = TicketSchema.extend({
   /** One entry per artifact stage, in playbook order. */
   stages: z.array(StageViewSchema),
   /** Log entries, oldest first. */
   log: z.array(AuditLogEntrySchema),
-  /** Question of the agent while the ticket is `awaiting_answer`. */
+  /** Free-text question of the agent while the ticket is `awaiting_answer`. */
   pendingQuestion: z.string().nullable(),
+  /** Approaches to pick from while the ticket is `awaiting_answer` with a choice (stage 2). */
+  pendingChoice: PendingChoiceSchema.nullable(),
+  /** Questions and choices the agent asked since the current stage was last started. */
+  questionsAsked: z.number().int(),
+  /** Maximum of questions and choices in the current stage; null without limit (stage 1, done). */
+  questionLimit: z.number().int().nullable(),
   /** Agent cost of the ticket, per stage and in total. */
   costs: CostSummarySchema,
 })
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/shared
npx vitest run --root packages/core src/application/queries.test.ts
npm test && npm run build && npm run lint
```

Erwartet: grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/test/fixtures.ts packages/core/src/application/queries.test.ts packages/core/src/application/queries.ts packages/shared/src/api.test.ts packages/shared/src/api.ts
git commit -m "feat(core): offene Auswahl und Rückfragen-Zähler auf der Ticketseite" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 9: Claude-Adapter: Spec-Agent, Prompt mit Intent und Rückfragen-Rest
**Files:**
- Delete: `packages/core/skills/refinement-agent.md`
- Create: `packages/core/skills/spec-agent.md`
- Modify: `packages/core/src/adapters/claudeCli/index.test.ts`
- Modify: `packages/core/src/adapters/claudeCli/index.ts`
- Modify: `packages/core/src/adapters/claudeCli/prompt.test.ts`
- Modify: `packages/core/src/adapters/claudeCli/prompt.ts`

`STAGE_AGENTS` wird vollständig (`Record<ArtifactStage, StageAgent>`, exportiert — der Spec-Eval in Task 13 nutzt denselben Weg): `design` → `spec-agent.md` + `SpecAgentOutputSchema`. Damit entfällt der Fehler „Für die Stufe … gibt es noch keinen Agent“ samt Test. Der Prompt bekommt nach dem Ticket den Abschnitt „## Intent (gemergt auf showcase)“ und nach den beantworteten Fragen „## Rückfragen“ mit „Du hast noch N von 3 Rückfragen/Auswahlen.“; bei 0 zusätzlich die Pflicht zur Spec. Beide Abschnitte stehen auch im Korrektur-Prompt des Retrys (der Retry ist ein neuer Prozess ohne Gedächtnis). `skills/spec-agent.md` ersetzt `skills/refinement-agent.md` (Ablauf nach Spec §4, Ausgabeformat mit `choice`, Regeln).

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `packages/core/src/adapters/claudeCli/index.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -135,10 +135,53 @@ describe('runAgent (stage plan)', () => {
     await expect(runAgent(INPUT, callbacks(), { ...OPTIONS, timeoutMs: 50 })).rejects.toBeInstanceOf(AgentRunTimeoutError)
   })
 
-  it('rejects stages without an agent before spawning claude', async () => {
+})
+
+describe('runAgent (stage design)', () => {
+  const DESIGN_INPUT: AgentRunnerInput = {
+    ...INPUT, stage: 'design', intent: '# CB-2: Lesezeit anzeigen', questionsRemaining: 1,
+  }
+  const SPEC_OUTPUT = JSON.stringify({
+    type: 'spec',
+    result: {
+      title: 'Lesezeit', goal: 'Die API liefert eine Lesezeit.',
+      approach: { chosen: 'Im Service', rationale: 'keine Migration', alternatives: [{ name: 'Feld', reason: 'Migration' }] },
+      components: [], dataFlow: 'Route → Service', errorHandling: 'keine', acceptanceCriteria: ['Feld vorhanden'], tests: 'Unit',
+      affectedFiles: [{ path: 'src/app.js', change: 'Feld', isNew: false }], risks: [], openPoints: [],
+    },
+  })
+
+  it('maps design to the spec skill and its schema', async () => {
+    const { STAGE_AGENTS } = await import('./index')
+    const { SpecAgentOutputSchema } = await import('@refinement/shared')
+    expect(STAGE_AGENTS.design).toEqual({ skillFile: 'spec-agent.md', schema: SpecAgentOutputSchema })
+    expect(fs.existsSync(path.join(OPTIONS.skillsDir, 'spec-agent.md'))).toBe(true)
+  })
+
+  it('sends the spec skill, the intent and the remaining questions and returns the spec', async () => {
+    const proc = makeFakeProcess(resultLine(SPEC_OUTPUT), 0)
+    mockSpawn.mockReturnValue(proc)
+    const { runAgent } = await import('./index')
+    const { output } = await runAgent(DESIGN_INPUT, callbacks(), OPTIONS)
+    const prompt = proc.stdin.write.mock.calls[0][0] as string
+    expect(prompt).toContain('# Spec Agent Skill')
+    expect(prompt).toContain('## Intent (gemergt auf showcase)\n\n# CB-2: Lesezeit anzeigen')
+    expect(prompt).toContain('Du hast noch 1 von 3 Rückfragen/Auswahlen.')
+    expect(output).toMatchObject({ type: 'spec', result: { title: 'Lesezeit' } })
+  })
+
+  it('accepts a choice and rejects an intent in stage design', async () => {
+    const choice = JSON.stringify({
+      type: 'choice', question: 'Wo?', recommended: 'A',
+      options: [{ id: 'A', title: 'a', description: 'd', pros: [], cons: [] }, { id: 'B', title: 'b', description: 'd', pros: [], cons: [] }],
+    })
+    mockSpawn.mockImplementationOnce(() => makeFakeProcess(resultLine(choice), 0))
     const { runAgent } = await import('./index')
-    await expect(runAgent({ ...INPUT, stage: 'design' }, callbacks(), OPTIONS)).rejects.toThrow('design')
-    expect(mockSpawn).not.toHaveBeenCalled()
+    expect((await runAgent(DESIGN_INPUT, callbacks(), OPTIONS)).output.type).toBe('choice')
+
+    mockSpawn.mockImplementation(() => makeFakeProcess(resultLine(INTENT_OUTPUT), 0))
+    const { SchemaValidationError } = await import('./errors')
+    await expect(runAgent(DESIGN_INPUT, callbacks(), OPTIONS)).rejects.toBeInstanceOf(SchemaValidationError)
   })
 })
```

Ändern: `packages/core/src/adapters/claudeCli/prompt.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -39,4 +39,31 @@ describe('buildPrompt', () => {
     expect(prompt).toContain('kein gültiges JSON')
     expect(prompt).not.toContain('x'.repeat(3001))
   })
+
+  it('quotes the merged intent after the ticket', () => {
+    const prompt = buildPrompt({ ...BASE, intent: '# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien\n' })
+    expect(prompt).toContain('## Intent (gemergt auf showcase)\n\n# CB-2: Lesezeit anzeigen\n\n## Erfolgskriterien')
+    expect(prompt.indexOf('## Beschreibung')).toBeLessThan(prompt.indexOf('## Intent'))
+    expect(buildPrompt(BASE)).not.toContain('## Intent')
+  })
+
+  it('names the remaining questions and demands the spec when none are left', () => {
+    expect(buildPrompt({ ...BASE, questionsRemaining: 2 })).toContain('## Rückfragen\n\nDu hast noch 2 von 3 Rückfragen/Auswahlen.')
+    expect(buildPrompt({ ...BASE, questionsRemaining: 2 })).not.toContain('Liefere jetzt die Spec')
+    expect(buildPrompt({ ...BASE, questionsRemaining: 0 })).toContain(
+      'Du hast noch 0 von 3 Rückfragen/Auswahlen. Liefere jetzt die Spec ("type": "spec") — keine Rückfrage und keine Auswahl mehr; '
+      + 'Unklares gehört unter Offene Punkte (openPoints).',
+    )
+    expect(buildPrompt(BASE)).not.toContain('## Rückfragen')
+  })
+
+  it('keeps intent and remaining questions in the correction prompt', () => {
+    const prompt = buildPrompt({
+      ...BASE, intent: 'Intent-Text', questionsRemaining: 0,
+      retryContext: { previousOutput: '{}', reason: 'schema_mismatch', schemaError: 'result fehlt' },
+    })
+    expect(prompt).toContain('## Intent (gemergt auf showcase)\n\nIntent-Text')
+    expect(prompt).toContain('Du hast noch 0 von 3')
+    expect(prompt.indexOf('## Rückfragen')).toBeLessThan(prompt.indexOf('## Korrektur erforderlich'))
+  })
 })
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core src/adapters/claudeCli
```

Erwartet: FAIL — Prompt-Tests finden „## Intent (gemergt auf showcase)“ und „## Rückfragen“ nicht; `STAGE_AGENTS` ist `undefined`; der Design-Lauf wirft „Für die Stufe design gibt es noch keinen Agent“.

- [ ] **Step 3: Implementieren**

Löschen: `packages/core/skills/refinement-agent.md` (`git rm packages/core/skills/refinement-agent.md`)

Neu: `packages/core/skills/spec-agent.md`

```markdown
# Spec Agent Skill

You are the spec agent of stage 2 (Design) of an AI-native software development lifecycle. You turn a merged
**intent** — which problem exists, which outcome is wanted, how success is recognised — into a **spec**: the
design of the solution in the existing codebase. A human reviews the spec as a pull request; once merged, stage 3
(Build) implements it.

You design, you do not implement: no code, no patches, no step-by-step implementation plan. Describe components,
interfaces, data flow, error handling, acceptance criteria and tests precisely enough that an engineer can build
it without guessing.

## Input

- **Intent:** in the section „Intent (gemergt auf showcase)“ of this prompt; the same file lies in the clone under
  `docs/work/<KEY>/intent.md`. Its success criteria are the yardstick of your spec.
- **Ticket:** the raw ticket the intent was written from — background only; the intent wins where they differ.
- **Codebase-Übersicht:** may be provided; use it first and read files only for specific facts.
- **Bisherige Rückfragen:** questions and choices that are already answered — do not ask them again. A picked
  approach reads „Ansatz B: <Titel> — Anmerkung: …“; build the spec on it and respect the note.
- **Rückfragen:** how many questions or choices you may still ask („Du hast noch N von 3 Rückfragen/Auswahlen“).

## Process

1. Read the intent. Note every success criterion.
2. Examine the codebase in a targeted way: existing patterns (routing, services, data access, validation, tests),
   the places the change touches, naming conventions. Read only what the design needs.
3. **Real alternatives?** If two or three approaches would shape the architecture differently (e.g. compute on
   write vs. on read, new table vs. new field) and the codebase does not decide it, return a **choice** with 2–3
   approaches, their pros and cons and your recommendation. No choice for matters of taste or details you can
   decide yourself with a short rationale.
4. **Blocking gap?** If a business rule is missing that no reasonable assumption can fill and the spec would be
   wrong without it, return a **question** — one question per run, concrete and answerable.
5. Otherwise write the **spec**:
   - Every success criterion of the intent is covered by at least one verifiable acceptance criterion.
   - YAGNI: nothing the intent does not ask for — no extra endpoints, options or refactorings.
   - Follow the existing patterns of the codebase; name the files and functions you build on.
   - Name at least one alternative you dropped, with the reason.
   - Unclear but not blocking → `openPoints`.

If the prompt says you have **0** questions or choices left, you must return the spec: put everything still
unclear into `openPoints`.

## Output-Format

Your entire answer is exactly one JSON object — no text before or after it, no Markdown code block.

**Option 1 — Rückfrage:**
{ "type": "question", "question": "<konkrete Frage an den Product Owner>" }

**Option 2 — Auswahl:**
{
  "type": "choice",
  "question": "<welche Entscheidung ansteht, z. B. Wo wird die Lesezeit berechnet?>",
  "options": [
    {
      "id": "A",
      "title": "<kurzer Name des Ansatzes>",
      "description": "<wie der Ansatz funktioniert, 1–3 Sätze>",
      "pros": ["<Vorteil>"],
      "cons": ["<Nachteil>"]
    },
    { "id": "B", "title": "…", "description": "…", "pros": ["…"], "cons": ["…"] }
  ],
  "recommended": "<id der empfohlenen Option>"
}

2 or 3 options with the ids `A`, `B`, `C` (each once); `recommended` is one of them.

**Option 3 — Spec:**
{
  "type": "spec",
  "result": {
    "title": "<max 60 Zeichen>",
    "goal": "<was die Änderung erreicht, 2–4 Sätze; zugleich Kurzfassung im PR>",
    "approach": {
      "chosen": "<gewählter Ansatz in 2–4 Sätzen>",
      "rationale": "<warum dieser Ansatz, mit Bezug auf Codebase und Intent>",
      "alternatives": [{ "name": "<verworfene Alternative>", "reason": "<warum verworfen>" }]
    },
    "components": [
      {
        "name": "<Modul, Funktion oder Datei>",
        "purpose": "<wofür>",
        "interface": "<Signatur, Route oder Datenform, z. B. GET /api/articles/:slug → { article: { …, readingTimeMinutes } }>",
        "dependsOn": ["<andere Komponente oder vorhandenes Modul>"]
      }
    ],
    "dataFlow": "<wie Daten durch die Komponenten laufen>",
    "errorHandling": "<welche Fehler auftreten können und wie sie behandelt werden>",
    "acceptanceCriteria": ["<prüfbares Kriterium, z. B. GET /api/articles/:slug liefert readingTimeMinutes als ganze Zahl ≥ 1>"],
    "tests": "<was mit welcher Testart geprüft wird (Unit, Integration, End-to-End)>",
    "affectedFiles": [{ "path": "<Pfad relativ zum Repo>", "change": "<was sich ändert>", "isNew": false }],
    "risks": [{ "description": "<Risiko>", "severity": "low|medium|high", "mitigation": "<Gegenmaßnahme>" }],
    "openPoints": [{ "question": "<offene, nicht blockierende Frage>" }]
  }
}

`title` must not exceed 60 characters. `acceptanceCriteria` holds at least one criterion and covers every success
criterion of the intent; each criterion is observable and unambiguous. `affectedFiles`: a path with
`"isNew": false` must exist in the repository (check it with Glob or Read); new files have `"isNew": true`.
`components`, `alternatives`, `dependsOn`, `affectedFiles`, `risks` and `openPoints` may be empty arrays, but a
spec without a dropped alternative is rarely well-founded.

## Rules

- Never modify files in the repository — read only.
- Write in the language of the ticket.
- No implementation code in any field: no code blocks, no function bodies. Signatures and routes are fine.
- Do not invent requirements that neither the intent nor the answered questions support.
- At most one question or one choice per run; never ask again what „Bisherige Rückfragen“ already answers.
```

Ändern: `packages/core/src/adapters/claudeCli/index.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,7 +1,7 @@
 import fs from 'fs/promises'
 import path from 'path'
 import type { ZodType } from 'zod'
-import { IntentAgentOutputSchema, type StageOutput } from '@refinement/shared'
+import { IntentAgentOutputSchema, SpecAgentOutputSchema, type StageOutput } from '@refinement/shared'
 import type {
   AgentRunner, AgentRunnerInput, AgentRunMeta, AgentRunResult, AgentRunCallbacks, ClaudeProcessSandbox,
 } from '../../ports'
@@ -15,17 +15,16 @@ import type { ExtractedResult, ClaudeCallResult } from './types'
 
 const SCHEMA_ERROR_PREVIEW_CHARS = 120
 
-interface StageAgent {
+/** Skill file (in `skills/`) and output schema of one stage agent. */
+export interface StageAgent {
   skillFile: string
   schema: ZodType<StageOutput>
 }
 
-/**
- * Skill and output schema per stage. A stage without an entry cannot run yet
- * (see `STARTABLE_STAGES` in domain/rules).
- */
-const STAGE_AGENTS: Partial<Record<ArtifactStage, StageAgent>> = {
+/** Skill and output schema per stage; the spec eval (`evals/spec.eval.ts`) runs the design agent the same way. */
+export const STAGE_AGENTS: Record<ArtifactStage, StageAgent> = {
   plan: { skillFile: 'intent-agent.md', schema: IntentAgentOutputSchema },
+  design: { skillFile: 'spec-agent.md', schema: SpecAgentOutputSchema },
 }
 
 /** Skill text, output schema, sandbox and timeout of one run; the same for both of its Claude calls. */
@@ -52,7 +51,9 @@ async function runClaudeOnce(
     title: input.title,
     description: input.description,
     codebaseSummary: input.codebaseSummary,
+    intent: input.intent,
     answeredQuestions: input.answeredQuestions,
+    questionsRemaining: input.questionsRemaining,
     retryContext,
   })
 
@@ -129,7 +130,6 @@ export interface ClaudeCliOptions {
  * One automatic retry on a SchemaValidationError (the retry prompt quotes the malformed output);
  * terminate, timeout and CLI errors propagate immediately. Tokens and cost cover both calls.
  * Every call runs in the sandbox (guard and audit hooks, clean env); its tool calls reach `callbacks.onToolEvent`.
- * @throws {Error} if the stage has no agent yet.
  * @throws {AgentRunTerminatedError} if the process is killed via `stopAgent`.
  * @throws {AgentRunTimeoutError} if a Claude call exceeds `options.timeoutMs`.
  * @throws {CliError} if the Claude process exits with a non-zero code.
@@ -141,10 +141,6 @@ export async function runAgent(
   options: ClaudeCliOptions,
 ): Promise<AgentRunResult> {
   const stageAgent = STAGE_AGENTS[input.stage]
-  // German: failStage shows this message on the ticket page.
-  if (!stageAgent) {
-    throw new Error(`Für die Stufe ${input.stage} gibt es noch keinen Agent`)
-  }
   const agent: LoadedAgent = {
     skill: await fs.readFile(path.join(/*turbopackIgnore: true*/ options.skillsDir, stageAgent.skillFile), 'utf-8'),
     schema: stageAgent.schema,
```

Ändern: `packages/core/src/adapters/claudeCli/prompt.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,4 +1,5 @@
 import type { QAPair } from '../../domain/types'
+import { QUESTION_LIMIT } from '../../domain/rules'
 import type { SchemaFailureReason } from './errors'
 
 const MAX_RETRY_OUTPUT_CHARS = 3000
@@ -18,18 +19,23 @@ export interface PromptInput {
   title: string
   description: string
   codebaseSummary?: string
+  /** Merged intent of the ticket (design stage), quoted after the ticket. */
+  intent?: string
   answeredQuestions: QAPair[]
+  /** Questions and choices the agent may still ask; absent for a stage without limit (plan). */
+  questionsRemaining?: number
   retryContext?: RetryContext
 }
 
 /**
- * Builds the full prompt for the Claude CLI: skill, ticket and answered questions.
- * With `retryContext` it becomes a correction prompt that quotes the malformed output.
+ * Builds the full prompt for the Claude CLI: skill, ticket, intent (design), answered questions and the remaining
+ * questions. With `retryContext` it becomes a correction prompt that quotes the malformed output.
  */
 export function buildPrompt(input: PromptInput): string {
+  const context = [...ticketSection(input), intentSection(input), answeredQuestionsSection(input), questionBudgetSection(input)]
   const parts = input.retryContext
-    ? [input.skill, '---', ...ticketSection(input), answeredQuestionsSection(input), correctionSection(input.retryContext)]
-    : [input.skill, '---', summarySection(input), ...ticketSection(input), answeredQuestionsSection(input)]
+    ? [input.skill, '---', ...context, correctionSection(input.retryContext)]
+    : [input.skill, '---', summarySection(input), ...context]
   return parts.filter((part): part is string => Boolean(part)).join('\n\n')
 }
 
@@ -42,6 +48,23 @@ function summarySection(input: PromptInput): string | null {
   return input.codebaseSummary ? `## Codebase-Übersicht\n\n${input.codebaseSummary}\n\n---` : null
 }
 
+function intentSection(input: PromptInput): string | null {
+  return input.intent ? `## Intent (gemergt auf showcase)\n\n${input.intent.trim()}` : null
+}
+
+/** Said to the agent once it used up its questions (`QUESTION_LIMIT`). */
+const DELIVER_SPEC = 'Liefere jetzt die Spec ("type": "spec") — keine Rückfrage und keine Auswahl mehr; '
+  + 'Unklares gehört unter Offene Punkte (openPoints).'
+
+/** How many questions or choices are left; at 0 the agent must deliver the spec. */
+function questionBudgetSection(input: PromptInput): string | null {
+  if (input.questionsRemaining === undefined) {
+    return null
+  }
+  const budget = `Du hast noch ${input.questionsRemaining} von ${QUESTION_LIMIT} Rückfragen/Auswahlen.`
+  return input.questionsRemaining > 0 ? `## Rückfragen\n\n${budget}` : `## Rückfragen\n\n${budget} ${DELIVER_SPEC}`
+}
+
 function answeredQuestionsSection(input: PromptInput): string | null {
   if (!input.answeredQuestions.length) {
     return null
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core src/adapters/claudeCli
npm test && npm run build && npm run lint
```

Erwartet: grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/skills/refinement-agent.md packages/core/skills/spec-agent.md packages/core/src/adapters/claudeCli/index.test.ts packages/core/src/adapters/claudeCli/index.ts packages/core/src/adapters/claudeCli/prompt.test.ts packages/core/src/adapters/claudeCli/prompt.ts
git commit -m "feat(core): Spec-Agent mit Skill, Schema und Prompt für Stufe 2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 10: Klon auf `showcase` (fetch + `checkout -B`)
**Files:**
- Create: `packages/core/src/adapters/git/repoCache.baseBranch.test.ts`
- Modify: `packages/core/src/adapters/git/repoCache.ensureRepo.test.ts`
- Modify: `packages/core/src/adapters/git/repoCache.symlinks.test.ts`
- Modify: `packages/core/src/adapters/git/repoCache.test.ts`
- Modify: `packages/core/src/adapters/git/repoCache.ts`
- Modify: `packages/core/src/compose.ts`

`ensureRepo(url, cacheDir, baseBranch)` stellt den Klon vor jedem Lauf auf den Stand von `origin/<baseBranch>`: `remote set-url`, `config core.symlinks false`, `fetch -q origin <base>`, `checkout -q -f -B <base> FETCH_HEAD`, `rm -r -q --cached .`, `reset -q --hard`. Anders als `git pull` übersteht das den Force-Reset von `showcase` durch den Reset-Button. Schlägt die Aktualisierung fehl, folgt wie bisher ein frischer Klon (danach derselbe Checkout); fehlt `showcase` auch im frischen Klon, wirft `ensureRepo` → „Repository konnte nicht geladen werden …“. Der Branch-Name kommt über `RepoCacheOptions.baseBranch` aus `compose.ts` (`SHOWCASE_BRANCH` bzw. `EngineConfig.baseBranch`); der Port `RepoProvider` bleibt unverändert. Ungetrackte Summary-Dateien im Klon bleiben erhalten. Nebenläufigkeit: alle git-Aufrufe sind `execFileSync`, zwei `ensureRepo` desselben Prozesses überlappen also nicht; ein Agent, der gerade liest, während ein zweites Ticket den Klon aktualisiert, sieht wie bisher den neuen Stand (keine Verschärfung gegenüber `pull`).

- [ ] **Step 1: Failing Tests schreiben**

Neu: `packages/core/src/adapters/git/repoCache.baseBranch.test.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureRepo } from './repoCache'

// Real git: the clone follows the base branch `showcase` of the remote, also after the app's reset force-moved it
// to another commit (a `git pull` fails there). The default branch `master` is never checked out.

const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-base-branch-')))
const source = path.join(base, 'source')
const cacheDir = path.join(base, 'cache')
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd, stdio: 'pipe' }).toString().trim()

function commitFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true })
  fs.writeFileSync(path.join(source, file), content)
  git(source, 'add', '.')
  git(source, 'commit', '-qm', file)
}

beforeAll(() => {
  fs.mkdirSync(source)
  git(source, 'init', '-q', '-b', 'master')
  commitFile('README.md', 'base')
  git(source, 'tag', 'showcase-base')
  git(source, 'checkout', '-q', '-b', 'showcase')
  commitFile('docs/work/CB-1/intent.md', '# CB-1: Intent')
  git(source, 'checkout', '-q', 'master')
  commitFile('master-only.md', 'nur auf master')
})

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

describe('ensureRepo — base branch', () => {
  it('checks out the base branch, not the default branch', async () => {
    const dir = await ensureRepo(source, cacheDir, 'showcase')
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(source, 'rev-parse', 'showcase'))
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('showcase')
    expect(fs.readFileSync(path.join(dir, 'docs/work/CB-1/intent.md'), 'utf-8')).toBe('# CB-1: Intent')
    expect(fs.existsSync(path.join(dir, 'master-only.md'))).toBe(false)
  })

  it('follows new commits and a force-reset of the base branch between two runs', async () => {
    const dir = await ensureRepo(source, cacheDir, 'showcase')
    fs.writeFileSync(path.join(dir, 'codebase-summary-x.md'), 'bleibt')

    git(source, 'checkout', '-q', 'showcase')
    commitFile('docs/work/CB-1/spec.md', '# CB-1: Spec')
    git(source, 'checkout', '-q', 'master')
    await ensureRepo(source, cacheDir, 'showcase')
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/spec.md'))).toBe(true)

    git(source, 'branch', '-f', 'showcase', 'showcase-base') // the app's reset: force back to the baseline tag
    await ensureRepo(source, cacheDir, 'showcase')

    expect(git(dir, 'rev-parse', 'HEAD')).toBe(git(source, 'rev-parse', 'showcase-base'))
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/intent.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'docs/work/CB-1/spec.md'))).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'codebase-summary-x.md'), 'utf-8')).toBe('bleibt')
    expect(git(dir, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })
})
```

Ändern: `packages/core/src/adapters/git/repoCache.ensureRepo.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -32,6 +32,16 @@ import { ensureRepo } from './repoCache'
 
 const REPO_URL = 'https://github.com/test/repo'
 const CACHE_DIR = '/tmp/test/repo-cache'
+const CLONE = ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')]
+const CHECKOUT_SHOWCASE = [
+  ['remote', 'set-url', 'origin', REPO_URL],
+  ['config', 'core.symlinks', 'false'],
+  ['fetch', '-q', 'origin', 'showcase'],
+  ['checkout', '-q', '-f', '-B', 'showcase', 'FETCH_HEAD'],
+  ['rm', '-r', '-q', '--cached', '.'],
+  ['reset', '-q', '--hard'],
+]
+const gitArgs = () => mockExecFileSync.mock.calls.map((call) => call[1])
 
 describe('ensureRepo', () => {
   beforeEach(() => {
@@ -43,68 +53,52 @@ describe('ensureRepo', () => {
     vi.unstubAllEnvs()
   })
 
-  it('clones the repo when the cache directory does not exist', async () => {
+  it('clones the repo and checks out the base branch when the cache directory does not exist', async () => {
     mockExistsSync.mockReturnValue(false)
-    await ensureRepo(REPO_URL, CACHE_DIR)
+    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
     expect(mockMkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true })
-    expect(mockExecFileSync).toHaveBeenCalledWith(
-      'git',
-      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
-      expect.objectContaining({ stdio: 'pipe' }),
-    )
+    expect(gitArgs()).toEqual([CLONE, ...CHECKOUT_SHOWCASE])
+    expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ stdio: 'pipe' }))
   })
 
-  it('pulls when the cache directory already exists', async () => {
+  it('fetches the base branch and resets onto it when the cache directory already exists', async () => {
     mockExistsSync.mockReturnValue(true)
-    await ensureRepo(REPO_URL, CACHE_DIR)
-    expect(mockExecFileSync).toHaveBeenCalledWith(
-      'git',
-      ['pull'],
-      expect.objectContaining({ stdio: 'pipe' }),
-    )
+    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
+    expect(gitArgs()).toEqual(CHECKOUT_SHOWCASE)
+    expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ cwd: expect.any(String), stdio: 'pipe' }))
+    expect(gitArgs()).not.toContainEqual(['pull'])
   })
 
-  it('removes the broken directory and re-clones when git pull fails', async () => {
+  it('removes the broken directory and re-clones when the update fails', async () => {
     mockExistsSync.mockReturnValue(true)
     mockExecFileSync
       .mockReturnValueOnce(Buffer.from(''))
       .mockReturnValueOnce(Buffer.from(''))
-      .mockImplementationOnce(() => { throw new Error('not a git repository') })
-      .mockReturnValueOnce(Buffer.from(''))
-    await ensureRepo(REPO_URL, CACHE_DIR)
+      .mockImplementationOnce(() => {
+        throw new Error('not a git repository')
+      })
+    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
     expect(mockRmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true })
     expect(mockMkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true })
-    expect(mockExecFileSync).toHaveBeenCalledTimes(4)
-    expect(mockExecFileSync).toHaveBeenLastCalledWith(
-      'git',
-      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
-      expect.objectContaining({ stdio: 'pipe' }),
-    )
+    expect(gitArgs().slice(3)).toEqual([CLONE, ...CHECKOUT_SHOWCASE])
   })
 
-  it('clones with the plain URL even when GITHUB_TOKEN is set', async () => {
+  it('fails when the fresh clone has no base branch', async () => {
     mockExistsSync.mockReturnValue(false)
-    vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
-    await ensureRepo(REPO_URL, CACHE_DIR)
-    expect(mockExecFileSync).toHaveBeenCalledWith(
-      'git',
-      ['clone', '-c', 'core.symlinks=false', REPO_URL, expect.stringContaining('repo-cache')],
-      expect.objectContaining({ stdio: 'pipe' }),
-    )
+    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
+      if (args[0] === 'fetch') {
+        throw new Error("couldn't find remote ref showcase")
+      }
+      return Buffer.from('')
+    })
+    await expect(ensureRepo(REPO_URL, CACHE_DIR, 'showcase')).rejects.toThrow('remote ref showcase')
   })
 
-  it('resets the remote URL before pulling an existing cache', async () => {
-    mockExistsSync.mockReturnValue(true)
+  it('clones with the plain URL even when GITHUB_TOKEN is set', async () => {
+    mockExistsSync.mockReturnValue(false)
     vi.stubEnv('GITHUB_TOKEN', 'mytoken123')
-    await ensureRepo(REPO_URL, CACHE_DIR)
-    const calls = mockExecFileSync.mock.calls.map((c) => c[1])
-    expect(calls).toEqual([
-      ['remote', 'set-url', 'origin', REPO_URL],
-      ['config', 'core.symlinks', 'false'],
-      ['pull'],
-      ['rm', '-r', '-q', '--cached', '.'],
-      ['reset', '-q', '--hard'],
-    ])
-    expect(mockExecFileSync.mock.calls[0][2]).toEqual(expect.objectContaining({ cwd: expect.any(String) }))
+    await ensureRepo(REPO_URL, CACHE_DIR, 'showcase')
+    expect(gitArgs()[0]).toEqual(CLONE)
+    expect(JSON.stringify(gitArgs())).not.toContain('mytoken123')
   })
 })
```

Ändern: `packages/core/src/adapters/git/repoCache.symlinks.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -16,7 +16,7 @@ const git = (cwd: string, ...args: string[]) =>
 
 beforeAll(() => {
   fs.mkdirSync(source)
-  git(source, 'init', '-q')
+  git(source, 'init', '-q', '-b', 'showcase')
   fs.writeFileSync(path.join(source, 'a.txt'), 'a')
   fs.symlinkSync('/etc/passwd', path.join(source, 'link'))
   git(source, 'add', '.')
@@ -31,7 +31,7 @@ const isSymlink = (file: string) => fs.lstatSync(file).isSymbolicLink()
 
 describe('ensureRepo — symlinks as files', () => {
   it('checks symlinks out as plain files when cloning', async () => {
-    const dir = await ensureRepo(source, cacheDir)
+    const dir = await ensureRepo(source, cacheDir, 'showcase')
     expect(isSymlink(path.join(dir, 'link'))).toBe(false)
     expect(fs.readFileSync(path.join(dir, 'link'), 'utf-8')).toBe('/etc/passwd')
     fs.rmSync(dir, { recursive: true, force: true })
@@ -47,7 +47,7 @@ describe('ensureRepo — symlinks as files', () => {
     git(source, 'add', '.')
     git(source, 'commit', '-qm', 'second link')
 
-    await ensureRepo(source, cacheDir)
+    await ensureRepo(source, cacheDir, 'showcase')
 
     expect(isSymlink(path.join(dir, 'link'))).toBe(false)
     expect(isSymlink(path.join(dir, 'link2'))).toBe(false)
```

Ändern: `packages/core/src/adapters/git/repoCache.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -5,7 +5,9 @@ import os from 'os'
 import path from 'path'
 
 const CACHE_DIR = path.join(os.tmpdir(), 'repo-cache')
-const OPTIONS = { cacheDir: CACHE_DIR, sandbox: createAgentSandbox({ hooksDir: path.resolve(__dirname, '../../../hooks') }) }
+const OPTIONS = {
+  cacheDir: CACHE_DIR, sandbox: createAgentSandbox({ hooksDir: path.resolve(__dirname, '../../../hooks') }), baseBranch: 'showcase',
+}
 
 describe('getRepoDir', () => {
   it('generates consistent cache dir from repo url', () => {
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core src/adapters/git
```

Erwartet: FAIL — `repoCache.ensureRepo.test.ts`: Aufrufe enthalten `['pull']` statt `fetch`/`checkout`; `repoCache.baseBranch.test.ts`: HEAD des Klons ist der `master`-Commit, `docs/work/CB-1/intent.md` fehlt.

- [ ] **Step 3: Implementieren**

Ändern: `packages/core/src/adapters/git/repoCache.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -15,6 +15,8 @@ export interface RepoCacheOptions {
   cacheDir: string
   /** The summary run uses the same sandbox (guard and audit hooks, clean env) as the agent. */
   sandbox: ClaudeProcessSandbox
+  /** Branch the clone is checked out on (`showcase`): artifacts merged by earlier stages live there. */
+  baseBranch: string
 }
 
 /**
@@ -46,48 +48,54 @@ function freshClone(repoUrl: string, repoDir: string, cacheDir: string): void {
 }
 
 /**
- * Updates an existing cache without symlinks. Caches cloned before `core.symlinks=false` may still contain
- * symlinks; dropping the index and resetting re-checks out every tracked file, so they become plain files.
- * Safe because the cache belongs to the app (no local changes to keep; untracked summaries survive).
+ * Puts the clone on the head of `baseBranch` as it is on the remote, without symlinks. `fetch` + `checkout -B
+ * FETCH_HEAD` instead of `pull`: the base branch is force-reset by the app's reset, which a pull cannot follow.
+ * Caches cloned before `core.symlinks=false` may still contain symlinks; dropping the index and resetting re-checks
+ * out every tracked file, so they become plain files. Safe because the cache belongs to the app (no local changes to
+ * keep; untracked summaries survive).
  */
-function pullWithoutSymlinks(repoUrl: string, repoDir: string): void {
+function checkoutBaseBranch(repoUrl: string, repoDir: string, baseBranch: string): void {
   const git = (args: string[]) => execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' })
   // Strip any token an earlier version may have stored in the remote URL.
   git(['remote', 'set-url', 'origin', repoUrl])
   git(['config', 'core.symlinks', 'false'])
-  git(['pull'])
+  git(['fetch', '-q', 'origin', baseBranch])
+  git(['checkout', '-q', '-f', '-B', baseBranch, 'FETCH_HEAD'])
   git(['rm', '-r', '-q', '--cached', '.'])
   git(['reset', '-q', '--hard'])
 }
 
 /**
- * Ensures the repository is present and up-to-date in the local cache.
- * Clones the repo on first use; runs `git pull` on subsequent calls and clones afresh if the pull fails.
+ * Ensures the repository is present in the local cache and checked out on the head of `baseBranch`.
+ * Clones the repo on first use; fetches the branch on subsequent calls and clones afresh if that fails.
  * Symlinks are always checked out as plain files, so the agent cannot follow a link out of the clone (spec §13).
  * Uses the plain URL without credentials (the target repo is public); the agent
  * must never see a write token. Caches cloned earlier with a token in the remote
- * URL are reset via `git remote set-url origin` before pulling.
+ * URL are reset via `git remote set-url origin` before fetching.
  *
  * Note: uses execFileSync — blocks the event loop during network I/O.
  *
- * @param repoUrl  - The repository URL.
- * @param cacheDir - Root of the clone cache.
+ * @param repoUrl    - The repository URL.
+ * @param cacheDir   - Root of the clone cache.
+ * @param baseBranch - Branch to check out, e.g. `showcase`.
  * @returns The absolute path to the cached repository directory.
- * @throws If `git clone` fails (a failed pull falls back to a fresh clone).
+ * @throws If `git clone` fails or the fresh clone has no `baseBranch` (a failed update falls back to a fresh clone).
  */
-export async function ensureRepo(repoUrl: string, cacheDir: string): Promise<string> {
+export async function ensureRepo(repoUrl: string, cacheDir: string, baseBranch: string): Promise<string> {
   const repoDir = getRepoDir(repoUrl, cacheDir)
 
   if (!fs.existsSync(repoDir)) {
     freshClone(repoUrl, repoDir, cacheDir)
+    checkoutBaseBranch(repoUrl, repoDir, baseBranch)
     return repoDir
   }
   try {
-    pullWithoutSymlinks(repoUrl, repoDir)
+    checkoutBaseBranch(repoUrl, repoDir, baseBranch)
   } catch {
-    // Any failed update (not a git repo after an interrupted clone, network error, diverged history, …)
-    // is answered with a fresh clone; the cache has no local changes (cached summaries are regenerated).
+    // Any failed update (not a git repo after an interrupted clone, network error, …) is answered with a fresh
+    // clone; the cache has no local changes (cached summaries are regenerated).
     freshClone(repoUrl, repoDir, cacheDir)
+    checkoutBaseBranch(repoUrl, repoDir, baseBranch)
   }
   return repoDir
 }
@@ -95,7 +103,7 @@ export async function ensureRepo(repoUrl: string, cacheDir: string): Promise<str
 /** RepoProvider port backed by a local git clone cache and a Claude-generated summary. */
 export function createGitRepoProvider(options: RepoCacheOptions): RepoProvider {
   return {
-    ensureRepo: (repoUrl) => ensureRepo(repoUrl, options.cacheDir),
+    ensureRepo: (repoUrl) => ensureRepo(repoUrl, options.cacheDir, options.baseBranch),
     ensureSummary: (repoDir, model, onProgress) => ensureRepoSummary(repoDir, model, onProgress, options),
   }
 }
```

Ändern: `packages/core/src/compose.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -81,7 +81,7 @@ export function createRefinementEngine(config: EngineConfig): UseCases {
       ? createGitHubCodeHost({ repoUrl: config.targetRepo, token: config.githubToken, baseBranch, baselineTag })
       : null,
     agent: createClaudeCliAgentRunner({ skillsDir: config.skillsDir, sandbox, timeoutMs: agentTimeoutMs }),
-    repos: createGitRepoProvider({ cacheDir: config.repoCacheDir ?? path.join(os.tmpdir(), 'repo-cache'), sandbox }),
+    repos: createGitRepoProvider({ cacheDir: config.repoCacheDir ?? path.join(os.tmpdir(), 'repo-cache'), sandbox, baseBranch }),
     events: createNodeEventPublisher(),
     repoUrl: config.targetRepo,
     baseBranch,
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core src/adapters/git src/compose.test.ts
npm test && npm run build && npm run lint
```

Erwartet: grün (echtes git, zwei Läufe mit Force-Reset dazwischen); danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A packages/core/src/adapters/git/repoCache.baseBranch.test.ts packages/core/src/adapters/git/repoCache.ensureRepo.test.ts packages/core/src/adapters/git/repoCache.symlinks.test.ts packages/core/src/adapters/git/repoCache.test.ts packages/core/src/adapters/git/repoCache.ts packages/core/src/compose.ts
git commit -m "feat(core): Klon des Ziel-Repos folgt showcase auch nach Force-Reset" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 11: Web: „Design starten“ mit Modellauswahl
**Files:**
- Modify: `apps/web/components/StartStagePanel.tsx`
- Modify: `apps/web/components/TicketActions.test.tsx`

`StartStagePanel` behandelt `plan` und `design` gleich (Modellauswahl, Start, Fehler- und Token-Hinweis); für `design` heißt der Knopf „Design starten“ und ein Hinweis (per `aria-describedby`) sagt: „Der Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.“ Der Kasten „Stufe 2 ist noch nicht gebaut“ entfällt.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `apps/web/components/TicketActions.test.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -97,12 +97,29 @@ describe('TicketActions', () => {
     expect(screen.getByText(/Merge auf GitHub = Freigabe/)).toBeInTheDocument()
   })
 
-  it('keeps the design stage disabled until stage 2 exists', () => {
+  it('starts the design stage with the chosen model and explains what the agent does', async () => {
+    vi.mocked(startStageAction).mockResolvedValue({ ok: true, data: undefined })
     renderActions({ stage: 'design' })
     const start = screen.getByRole('button', { name: 'Design starten' })
-    expect(start).toBeDisabled()
-    expect(start).toHaveAccessibleDescription(/Stufe 1 ist abgeschlossen.*Stufe 2 \(Design\) ist noch nicht gebaut/)
-    expect(screen.queryByRole('combobox', { name: 'Modell' })).toBeNull()
+    expect(start).toHaveAccessibleDescription(
+      'Der Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.',
+    )
+    expect(screen.queryByText(/noch nicht gebaut/)).toBeNull()
+
+    fireEvent.change(screen.getByRole('combobox', { name: 'Modell' }), { target: { value: 'claude-opus-4-7' } })
+    fireEvent.click(start)
+    await waitFor(() => expect(startStageAction).toHaveBeenCalledWith('CB-2', { model: 'claude-opus-4-7' }))
+  })
+
+  it('offers a restart of a failed design stage and disables it without token', () => {
+    const { unmount } = renderActions({ stage: 'design', state: 'failed' })
+    expect(screen.getByText(/fehlgeschlagen — Details im Log/)).toBeInTheDocument()
+    expect(screen.getByRole('button', { name: 'Design starten' })).toBeEnabled()
+    unmount()
+
+    renderActions({ stage: 'design' }, false)
+    expect(screen.getByRole('button', { name: 'Design starten' })).toBeDisabled()
+    expect(screen.getByText(/GITHUB_TOKEN fehlt/)).toBeInTheDocument()
   })
 
   it('reports a finished ticket', () => {
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root apps/web components/TicketActions.test.tsx
```

Erwartet: FAIL — „Design starten“ ist deaktiviert, die Beschreibung lautet „Stufe 1 ist abgeschlossen …“, es gibt keine Modellauswahl.

- [ ] **Step 3: Implementieren**

Ändern: `apps/web/components/StartStagePanel.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -6,6 +6,9 @@ import { Button } from './ui/button'
 const TOKEN_HINT_ID = 'token-hint'
 const DESIGN_HINT_ID = 'design-hint'
 
+/** Label of the start button per startable stage. */
+const START_LABEL = { plan: 'Plan starten', design: 'Design starten' } as const
+
 interface Props {
   stage: Stage
   /** The last attempt failed: the start doubles as a restart. */
@@ -20,8 +23,8 @@ interface Props {
 }
 
 /**
- * Action area of a ticket that is not running: model select and start for the plan stage (with failure and
- * token hints), a disabled start for the design stage, a done message after the last stage.
+ * Action area of a ticket that is not running: model select and start of the current stage (with failure, token
+ * and — for the design stage — a hint on what the agent does), a done message after the last stage.
  * No `'use client'`: it takes function props, so it is rendered only inside TicketActions.
  */
 export function StartStagePanel({ stage, failed, tokenConfigured, model, onModelChange, pending, onStart }: Props) {
@@ -29,32 +32,21 @@ export function StartStagePanel({ stage, failed, tokenConfigured, model, onModel
     return <p className="text-sm text-emerald-700">Alle Stufen abgeschlossen.</p>
   }
 
-  if (stage === 'design') {
-    return (
-      <div className="space-y-2">
-        <Button disabled aria-describedby={DESIGN_HINT_ID}>
-          Design starten
-        </Button>
-        <div id={DESIGN_HINT_ID} role="note" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
-          <p className="font-medium text-slate-700">Stufe 1 ist abgeschlossen — der Intent ist gemergt.</p>
-          <p className="mt-1 text-slate-600">
-            Stufe 2 (Design) ist noch nicht gebaut. Hier startet später der Design-Agent, der aus dem Intent die Spec
-            (<code>spec.md</code>) schreibt; dann gibt es auch die Modellauswahl. Den Intent siehst du unten unter „Stufen“.
-          </p>
-        </div>
-      </div>
-    )
-  }
-
+  const describedBy = [tokenConfigured ? null : TOKEN_HINT_ID, stage === 'design' ? DESIGN_HINT_ID : null].filter(Boolean).join(' ')
   return (
     <div className="space-y-2">
       {failed && <p className="text-sm text-red-600">Letzter Versuch fehlgeschlagen — Details im Log.</p>}
       <div className="flex items-center gap-2">
         <ModelSelect value={model} onChange={onModelChange} disabled={pending} size="sm" />
-        <Button disabled={!tokenConfigured || pending} aria-describedby={tokenConfigured ? undefined : TOKEN_HINT_ID} onClick={onStart}>
-          Plan starten
+        <Button disabled={!tokenConfigured || pending} aria-describedby={describedBy || undefined} onClick={onStart}>
+          {START_LABEL[stage]}
         </Button>
       </div>
+      {stage === 'design' && (
+        <p id={DESIGN_HINT_ID} className="text-xs text-slate-600">
+          Der Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.
+        </p>
+      )}
       {!tokenConfigured && (
         <p id={TOKEN_HINT_ID} className="text-xs text-amber-700">
           GITHUB_TOKEN fehlt — ohne Token kann die App keinen Branch und PR anlegen (siehe README).
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root apps/web components/TicketActions.test.tsx
npm test && npm run build && npm run lint
```

Erwartet: grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/components/StartStagePanel.tsx apps/web/components/TicketActions.test.tsx
git commit -m "feat(web): Stufe 2 in der App starten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 12: Web: `ChoicePanel`, Zähler „Rückfrage N von 3“, Action mit Auswahl
**Files:**
- Modify: `apps/web/app/actions.test.ts`
- Modify: `apps/web/app/actions.ts`
- Create: `apps/web/components/ChoicePanel.test.tsx`
- Create: `apps/web/components/ChoicePanel.tsx`
- Modify: `apps/web/components/QuestionPanel.test.tsx`
- Modify: `apps/web/components/QuestionPanel.tsx`
- Modify: `apps/web/components/TicketActions.test.tsx`
- Modify: `apps/web/components/TicketActions.tsx`
- Modify: `apps/web/lib/format.test.ts`
- Modify: `apps/web/lib/format.ts`

Neue Client-Komponente `ChoicePanel` an der Stelle von `QuestionPanel`, wenn `pendingChoice` gesetzt ist: Frage als `legend` eines `fieldset`, je Option ein natives Radio (Titel, Beschreibung, `+`/`−`-Listen per `aria-describedby`), Empfehlung markiert („empfohlen“) und vorausgewählt, optionale Anmerkung, „Auswahl senden“ (aktiv, sobald eine Option gewählt ist; Anmerkung getrimmt, leer → ohne `note`) und „Abbrechen“ (ruft `stopRunAction` über `TicketActions`; der separate Abbrechen-Knopf entfällt dort für die Auswahl). Native Radios sind tastaturbedienbar (Tab in die Gruppe, Pfeiltasten). `questionCounter(asked, limit)` in `lib/format.ts` liefert „Rückfrage N von 3“ oder `null` (Stufe 1); `QuestionPanel` und `ChoicePanel` zeigen ihn. `answerQuestionAction` nimmt `AnswerInput`.

- [ ] **Step 1: Failing Tests schreiben**

Ändern: `apps/web/app/actions.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -23,9 +23,11 @@ describe('server actions', () => {
   it('passes key and input through and refreshes the whole layout', async () => {
     expect(await startStageAction('CB-2', { model: 'm' })).toEqual({ ok: true, data: undefined })
     await answerQuestionAction('CB-2', { answer: 'Alle Leser' })
+    await answerQuestionAction('CB-2', { choice: 'B', note: 'ohne Cache' })
     await stopRunAction('CB-2')
     expect(engine.startStage).toHaveBeenCalledWith('CB-2', { model: 'm' })
     expect(engine.answerQuestion).toHaveBeenCalledWith('CB-2', { answer: 'Alle Leser' })
+    expect(engine.answerQuestion).toHaveBeenCalledWith('CB-2', { choice: 'B', note: 'ohne Cache' })
     expect(engine.stopRun).toHaveBeenCalledWith('CB-2')
     expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
   })
```

Neu: `apps/web/components/ChoicePanel.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PendingChoice } from '@refinement/shared'

vi.mock('@/app/actions', () => ({ answerQuestionAction: vi.fn() }))

import { answerQuestionAction } from '@/app/actions'
import { ChoicePanel } from './ChoicePanel'

const CHOICE: PendingChoice = {
  question: 'Wo wird die Lesezeit berechnet?',
  options: [
    { id: 'A', title: 'Beim Speichern', description: 'Feld am Artikel.', pros: ['schnell beim Lesen'], cons: ['Migration'] },
    { id: 'B', title: 'Beim Lesen', description: 'Im Service.', pros: ['keine Migration'], cons: ['Rechenzeit pro Abruf'] },
  ],
  recommended: 'B',
}

function renderPanel(patch: Partial<Parameters<typeof ChoicePanel>[0]> = {}) {
  const props = { ticketKey: 'CB-2', choice: CHOICE, counter: 'Rückfrage 1 von 3', onAnswered: vi.fn(), onCancel: vi.fn(), cancelPending: false, ...patch }
  render(<ChoicePanel {...props} />)
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChoicePanel', () => {
  it('shows the question as legend, every option with pros and cons, and the counter', () => {
    renderPanel()
    expect(screen.getByRole('group', { name: 'Wo wird die Lesezeit berechnet?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Ansatz A: Beim Speichern/ })).toHaveAccessibleDescription(/Feld am Artikel\..*\+ schnell beim Lesen.*− Migration/)
    expect(screen.getByText('Rückfrage 1 von 3')).toBeInTheDocument()
  })

  it('marks and preselects the recommended option', () => {
    renderPanel()
    expect(screen.getByRole('radio', { name: /Ansatz B: Beim Lesen.*empfohlen/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Ansatz A/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Auswahl senden' })).toBeEnabled()
  })

  it('sends the picked option with the note and notifies the parent', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    const props = renderPanel()
    fireEvent.click(screen.getByRole('radio', { name: /Ansatz A/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Anmerkung (optional)' }), { target: { value: ' Migration ist ok ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))

    await waitFor(() => expect(props.onAnswered).toHaveBeenCalled())
    expect(answerQuestionAction).toHaveBeenCalledWith('CB-2', { choice: 'A', note: 'Migration ist ok' })
  })

  it('sends the recommendation without a note', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))
    await waitFor(() => expect(answerQuestionAction).toHaveBeenCalledWith('CB-2', { choice: 'B' }))
  })

  it('shows the error of a rejected pick', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: false, error: 'Ansatz C wurde nicht angeboten' })
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ansatz C wurde nicht angeboten')
    expect(props.onAnswered).not.toHaveBeenCalled()
  })

  it('cancels through the parent', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('is keyboard-operable: native radios in one group, all focusable', () => {
    renderPanel()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(new Set(radios.map((radio) => radio.getAttribute('name')))).toEqual(new Set(['choice-CB-2']))
    radios[0]!.focus()
    expect(radios[0]).toHaveFocus()
  })
})
```

Ändern: `apps/web/components/QuestionPanel.test.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -41,4 +41,9 @@ describe('QuestionPanel', () => {
     expect(onAnswered).not.toHaveBeenCalled()
     expect(screen.getByPlaceholderText('Antwort eingeben…')).toHaveValue('Postgres')
   })
+
+  it('shows the counter of a limited stage', () => {
+    render(<QuestionPanel ticketKey="CB-1" question="Welche DB?" counter="Rückfrage 2 von 3" onAnswered={vi.fn()} />)
+    expect(screen.getByText('Rückfrage 2 von 3')).toBeInTheDocument()
+  })
 })
```

Ändern: `apps/web/components/TicketActions.test.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -84,6 +84,35 @@ describe('TicketActions', () => {
     expect(screen.getByRole('button', { name: 'Antworten' })).toBeInTheDocument()
   })
 
+  it('shows the counter at a question of the design stage only', () => {
+    const { unmount } = renderActions({ stage: 'design', state: 'awaiting_answer', pendingQuestion: 'Wer?', questionsAsked: 2, questionLimit: 3 })
+    expect(screen.getByText('Rückfrage 2 von 3')).toBeInTheDocument()
+    unmount()
+    renderActions({ state: 'awaiting_answer', pendingQuestion: 'Wer?', questionsAsked: 2, questionLimit: null })
+    expect(screen.queryByText(/Rückfrage \d von/)).toBeNull()
+  })
+
+  it('shows a choice instead of the question panel and cancels from it', async () => {
+    vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
+    renderActions({
+      stage: 'design', state: 'awaiting_answer', questionsAsked: 1, questionLimit: 3,
+      pendingChoice: {
+        question: 'Wo wird die Lesezeit berechnet?', recommended: 'A',
+        options: [
+          { id: 'A', title: 'Beim Speichern', description: 'd', pros: [], cons: [] },
+          { id: 'B', title: 'Beim Lesen', description: 'd', pros: [], cons: [] },
+        ],
+      },
+    })
+    expect(screen.getByRole('group', { name: 'Wo wird die Lesezeit berechnet?' })).toBeInTheDocument()
+    expect(screen.getByText('Rückfrage 1 von 3')).toBeInTheDocument()
+    expect(screen.queryByRole('button', { name: 'Antworten' })).toBeNull()
+    expect(screen.getAllByRole('button', { name: 'Abbrechen' })).toHaveLength(1)
+
+    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
+    await waitFor(() => expect(stopRunAction).toHaveBeenCalledWith('CB-2'))
+  })
+
   it('lets the user cancel while waiting for an answer', async () => {
     vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
     renderActions({ state: 'awaiting_answer', pendingQuestion: 'Frage?' })
```

Ändern: `apps/web/lib/format.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -1,5 +1,5 @@
 import { describe, it, expect } from 'vitest'
-import { formatCost, formatDate, formatDateTime, formatElapsed, formatRuns, formatTokens } from './format'
+import { formatCost, formatDate, formatDateTime, formatElapsed, formatRuns, formatTokens, questionCounter } from './format'
 
 describe('format', () => {
   it('formats date and time in German for Europe/Berlin', () => {
@@ -33,3 +33,10 @@ describe('format', () => {
     expect(formatRuns(4)).toBe('4 Läufe')
   })
 })
+
+describe('questionCounter', () => {
+  it('counts against the limit and is null without one', () => {
+    expect(questionCounter(2, 3)).toBe('Rückfrage 2 von 3')
+    expect(questionCounter(1, null)).toBeNull()
+  })
+})
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root apps/web components/ChoicePanel.test.tsx components/QuestionPanel.test.tsx components/TicketActions.test.tsx lib/format.test.ts app/actions.test.ts
```

Erwartet: FAIL — `Failed to load url ./ChoicePanel`; `questionCounter is not a function`; Zähler „Rückfrage 2 von 3“ nicht gefunden; `TicketActions` zeigt bei `pendingChoice` „Zustand wird abgeglichen…“. (`actions.test.ts` läuft schon grün — die Action reicht die Eingabe ungeprüft durch; Step 3 ändert nur ihren Typ.)

- [ ] **Step 3: Implementieren**

Ändern: `apps/web/app/actions.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -2,6 +2,7 @@
 
 import { revalidatePath } from 'next/cache'
 import type { StartupReport } from '@refinement/core'
+import type { AnswerInput } from '@refinement/shared'
 import { getEngine } from '@/lib/container'
 import { runAction, type ActionResult } from '@/lib/actionResult'
 
@@ -17,8 +18,8 @@ export async function startStageAction(ticketKey: string, input: { model: string
   return result
 }
 
-/** Answers the agent's open question; the stage continues in a new run. */
-export async function answerQuestionAction(ticketKey: string, input: { answer: string }): Promise<ActionResult> {
+/** Answers the agent's open question (`{ answer }`) or choice (`{ choice, note? }`); the stage continues in a new run. */
+export async function answerQuestionAction(ticketKey: string, input: AnswerInput): Promise<ActionResult> {
   const result = await runAction(() => getEngine().answerQuestion(ticketKey, input))
   refreshAll()
   return result
```

Neu: `apps/web/components/ChoicePanel.tsx`

```tsx
'use client'

import { useState } from 'react'
import type { ChoiceId, PendingChoice } from '@refinement/shared'
import { answerQuestionAction } from '@/app/actions'
import { useServerAction } from '@/hooks/useServerAction'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  ticketKey: string
  /** Approaches the agent offers; the recommended one is preselected. */
  choice: PendingChoice
  /** „Rückfrage N von 3“; absent without limit. */
  counter?: string
  /** Called after the pick was accepted. */
  onAnswered: () => void
  /** Ends the attempt (same as „Abbrechen“ next to a question). */
  onCancel: () => void
  /** The cancel action is running. */
  cancelPending: boolean
}

/**
 * Amber card with the agent's choice: question as legend, one radio per approach (title, description, pros and
 * cons; the recommendation marked and preselected), an optional note, „Auswahl senden“ and „Abbrechen“.
 * Native radios in a fieldset keep it keyboard-operable (Tab into the group, arrow keys between options).
 */
export function ChoicePanel({ ticketKey, choice, counter, onAnswered, onCancel, cancelPending }: Props) {
  const [selected, setSelected] = useState<ChoiceId | null>(choice.recommended)
  const [note, setNote] = useState('')
  const { run, pending: sending, error } = useServerAction()

  const handleSubmit = () => {
    if (!selected) {
      return
    }
    const input = note.trim() ? { choice: selected, note: note.trim() } : { choice: selected }
    run(() => answerQuestionAction(ticketKey, input), onAnswered)
  }

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-900">Auswahl vom Agent</CardTitle>
        {counter && <p className="text-xs text-amber-800">{counter}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">{choice.question}</legend>
          {choice.options.map((option) => {
            const recommended = option.id === choice.recommended
            return (
              <label key={option.id} className="flex cursor-pointer gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm">
                <input
                  type="radio"
                  name={`choice-${ticketKey}`}
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => setSelected(option.id)}
                  aria-describedby={`choice-${ticketKey}-${option.id}`}
                  className="mt-1"
                />
                <span className="space-y-1">
                  <span className="font-medium">
                    Ansatz {option.id}: {option.title}
                    {recommended && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs">empfohlen</span>}
                  </span>
                  <span id={`choice-${ticketKey}-${option.id}`} className="block space-y-1">
                    <span className="block text-slate-700">{option.description}</span>
                    {option.pros.map((pro) => (
                      <span key={`+${pro}`} className="block text-emerald-700">+ {pro}</span>
                    ))}
                    {option.cons.map((con) => (
                      <span key={`-${con}`} className="block text-red-700">− {con}</span>
                    ))}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <Textarea
          aria-label="Anmerkung (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anmerkung (optional)…"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={sending || !selected} size="sm">
            {sending ? 'Sende…' : 'Auswahl senden'}
          </Button>
          <Button variant="outline" size="sm" disabled={cancelPending || sending} onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

Ändern: `apps/web/components/QuestionPanel.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -11,12 +11,14 @@ interface Props {
   ticketKey: string
   /** Question asked by the agent. */
   question: string
+  /** „Rückfrage N von 3“; absent without limit. */
+  counter?: string
   /** Called after the answer was accepted. */
   onAnswered: () => void
 }
 
 /** Amber card with the agent's question and an answer field; a client component for the form state. */
-export function QuestionPanel({ ticketKey, question, onAnswered }: Props) {
+export function QuestionPanel({ ticketKey, question, counter, onAnswered }: Props) {
   const [answer, setAnswer] = useState('')
   const { run, pending: sending, error } = useServerAction()
 
@@ -34,6 +36,7 @@ export function QuestionPanel({ ticketKey, question, onAnswered }: Props) {
     <Card className="mt-4 border-amber-200 bg-amber-50">
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-semibold text-amber-900">Frage vom Agent</CardTitle>
+        {counter && <p className="text-xs text-amber-800">{counter}</p>}
       </CardHeader>
       <CardContent className="space-y-3">
         <p className="text-sm">{question}</p>
```

Ändern: `apps/web/components/TicketActions.tsx` (Diff gegen den Stand vor diesem Task)

```diff
@@ -5,11 +5,13 @@ import { useRouter } from 'next/navigation'
 import type { TicketDetailDto } from '@refinement/shared'
 import { startStageAction, stopRunAction } from '@/app/actions'
 import { DEFAULT_MODEL } from '@/lib/models'
+import { questionCounter } from '@/lib/format'
 import { useSSE } from '@/hooks/useSSE'
 import { useElapsedSeconds } from '@/hooks/useElapsedSeconds'
 import { useServerAction } from '@/hooks/useServerAction'
 import { useAppState } from './AppStateProvider'
 import { AgentRunningCard } from './AgentRunningCard'
+import { ChoicePanel } from './ChoicePanel'
 import { QuestionPanel } from './QuestionPanel'
 import { StartStagePanel } from './StartStagePanel'
 import { Button, buttonVariants } from './ui/button'
@@ -22,7 +24,7 @@ interface Props {
 
 /**
  * The action area of the ticket page, one per state: start (ready, failed), progress and stop (running),
- * question and cancel (awaiting_answer), PR link (in_review); plus the error of the last action.
+ * question or choice and cancel (awaiting_answer), PR link (in_review); plus the error of the last action.
  * A client component: it holds the model choice and pending/error state and listens to the ticket's SSE stream.
  * Progress events feed the live log; state and question events refresh the server-rendered page,
  * which delivers the new state as props.
@@ -46,6 +48,7 @@ export function TicketActions({ ticket, tokenConfigured }: Props) {
   const elapsed = useElapsedSeconds(ticket.state === 'running')
 
   const stop = () => run(() => stopRunAction(ticket.key))
+  const counter = questionCounter(ticket.questionsAsked, ticket.questionLimit) ?? undefined
 
   const actionArea = (): ReactNode => {
     switch (ticket.state) {
@@ -75,10 +78,22 @@ export function TicketActions({ ticket, tokenConfigured }: Props) {
           </>
         )
       case 'awaiting_answer':
+        if (ticket.pendingChoice) {
+          return (
+            <ChoicePanel
+              ticketKey={ticket.key}
+              choice={ticket.pendingChoice}
+              counter={counter}
+              onAnswered={() => router.refresh()}
+              onCancel={stop}
+              cancelPending={pending}
+            />
+          )
+        }
         return (
           <>
             {ticket.pendingQuestion && (
-              <QuestionPanel ticketKey={ticket.key} question={ticket.pendingQuestion} onAnswered={() => router.refresh()} />
+              <QuestionPanel ticketKey={ticket.key} question={ticket.pendingQuestion} counter={counter} onAnswered={() => router.refresh()} />
             )}
             <StopButton label="Abbrechen" pending={pending} onStop={stop} />
             {!ticket.pendingQuestion && <SyncingNotice />}
```

Ändern: `apps/web/lib/format.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -62,3 +62,8 @@ export function formatCost(usd: number): string {
 export function formatRuns(n: number): string {
   return n === 1 ? '1 Lauf' : `${n} Läufe`
 }
+
+/** Counter of the open question or choice, e.g. „Rückfrage 2 von 3“; null for a stage without limit. */
+export function questionCounter(asked: number, limit: number | null): string | null {
+  return limit === null ? null : `Rückfrage ${asked} von ${limit}`
+}
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root apps/web
npm test && npm run build && npm run lint
```

Erwartet: grün; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/app/actions.test.ts apps/web/app/actions.ts apps/web/components/ChoicePanel.test.tsx apps/web/components/ChoicePanel.tsx apps/web/components/QuestionPanel.test.tsx apps/web/components/QuestionPanel.tsx apps/web/components/TicketActions.test.tsx apps/web/components/TicketActions.tsx apps/web/lib/format.test.ts apps/web/lib/format.ts
git commit -m "feat(web): Auswahl des Design-Agents beantworten, Rückfragen-Zähler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 13: Spec-Eval: Fixture-Repo, Rubrik, `npm run eval:spec`
**Files:**
- Modify: `package.json`
- Modify: `packages/core/eslint.config.mjs`
- Create: `packages/core/evals/fixtures/articles-api/README.md`
- Create: `packages/core/evals/fixtures/articles-api/package.json`
- Create: `packages/core/evals/fixtures/articles-api/src/app.js`
- Create: `packages/core/evals/fixtures/articles-api/src/routes/articles.js`
- Create: `packages/core/evals/fixtures/articles-api/src/services/articleService.js`
- Create: `packages/core/evals/fixtures/articles-api/src/store/articleStore.js`
- Create: `packages/core/evals/fixtures/articles-api/test/articles.test.js`
- Create: `packages/core/evals/spec.eval.ts`
- Create: `packages/core/evals/specCases.ts`
- Create: `packages/core/evals/specRubric.test.ts`
- Create: `packages/core/evals/specRubric.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/architecture.test.ts`
- Modify: `packages/core/tsconfig.json`
- Modify: `packages/core/vitest.config.ts`

Qualitäts-Eval nach Spec §9. Bausteine:
- `evals/fixtures/articles-api/` — Mini-Express-API mit Artikel-Routen (Routen → Service → Store, `node --test`), reine Daten: aus `tsconfig` (`exclude`), ESLint (`ignores`) und Vitest (`exclude`) ausgenommen.
- `evals/specCases.ts` — zwei Intents (Lesezeit, Entwürfe) mit je 3 Erfolgskriterien.
- `evals/specRubric.ts` — reine Funktionen: feste Prüfungen (`fixedChecks`), Rubrik (Abdeckung, Prüfbarkeit, Passung zur Codebase, YAGNI, Konsistenz), `JudgeVerdictSchema` (Zod, je Kriterium genau eine Bewertung 1–5 plus Zuordnung Erfolgs- → Akzeptanzkriterien), Bewerter-Prompt, Schwelle `DEFAULT_MIN_SCORE = 3`. Getestet in `evals/specRubric.test.ts`, das jetzt mit `npm test` läuft: `vitest.config.ts` schließt statt `evals/**` nur noch `evals/**/*.eval.ts` und `evals/fixtures/**` aus.
- `evals/spec.eval.ts` — kopiert das Fixture in ein Temp-git-Repo (mit `docs/work/<KEY>/intent.md`), startet den **echten** Spec-Agent über `runAgent` (also `STAGE_AGENTS.design`, dieselbe Sandbox und derselbe Skill wie die App) mit `questionsRemaining: 0`, prüft fest (Spec geliefert und schema-gültig, Dateien existieren außer `isNew`, Akzeptanz- ≥ Erfolgskriterien, kein Code-Block, verworfene Alternative mit Grund) und lässt dann einen Bewerter (`claude --print --output-format json`, Haiku) ohne Werkzeuge bewerten: `--disallowedTools` für alle Werkzeuge, Guard-Hooks per `--settings`, leeres Temp-Verzeichnis als `cwd`, Sandbox-Umgebung; die feste Prüfung „Bewerter ohne Werkzeuge“ verlangt ein leeres Hook-Log. Deutsche Tabelle je Fall mit Kosten und Dauer, Exit-Code 1 bei Fehlschlag oder Bewertung unter der Schwelle. Modelle: `EVAL_MODEL` (Standard `claude-sonnet-4-6`), `EVAL_JUDGE_MODEL` (Standard `claude-haiku-4-5-20251001`), Schwelle `EVAL_MIN_SCORE`.
- npm-Skripte `eval:spec` in `packages/core` und der Wurzel; der Architekturtest prüft, dass `spec.eval.ts` da ist (die Regel „src/hooks importieren keine evals“ deckt die neuen Dateien ab).

Den Eval in diesem Task **nicht** ausführen (echter `claude`, kostet Tokens) — nur nach Zustimmung (Task 15).

- [ ] **Step 1: Failing Tests schreiben**

Neu: `packages/core/evals/fixtures/articles-api/test/articles.test.js`

```js
const test = require('node:test')
const assert = require('node:assert')
const store = require('../src/store/articleStore')
const articleService = require('../src/services/articleService')

test.beforeEach(() => store.clear())

test('creates and reads an article', () => {
  const created = articleService.createArticle({ title: 'Hallo Welt', body: 'Text', author: 'ana' })
  assert.strictEqual(created.slug, 'hallo-welt')
  assert.strictEqual(articleService.getArticle('hallo-welt').title, 'Hallo Welt')
})

test('lists the newest article first', () => {
  articleService.createArticle({ title: 'Erster', body: 'a', author: 'ana' })
  articleService.createArticle({ title: 'Zweiter', body: 'b', author: 'ben' })
  assert.strictEqual(articleService.listArticles().length, 2)
})

test('rejects an article without body', () => {
  assert.throws(() => articleService.createArticle({ title: 'Leer', author: 'ana' }), /erforderlich/)
})
```

Neu: `packages/core/evals/specRubric.test.ts`

````ts
import { describe, it, expect } from 'vitest'
import type { Intent, Spec } from '@refinement/shared'
import { JudgeVerdictSchema, RUBRIC, buildJudgePrompt, failedScores, fixedChecks } from './specRubric'

const INTENT: Intent = {
  title: 'Lesezeit', problem: 'P', desiredOutcome: 'O',
  successCriteria: ['Liste zeigt Lesezeit', 'Einzelansicht zeigt Lesezeit'], affected: [], openPoints: [],
}

const SPEC: Spec = {
  title: 'Lesezeit', goal: 'Ziel',
  approach: { chosen: 'Im Service', rationale: 'R', alternatives: [{ name: 'Datenbankfeld', reason: 'Migration' }] },
  components: [], dataFlow: 'D', errorHandling: 'E',
  acceptanceCriteria: ['GET /api/articles liefert readingTimeMinutes', 'GET /api/articles/:slug liefert readingTimeMinutes'],
  tests: 'Unit', risks: [], openPoints: [],
  affectedFiles: [
    { path: 'src/services/articleService.js', change: 'Feld', isNew: false },
    { path: 'src/services/readingTime.js', change: 'neu', isNew: true },
  ],
}

const FILES = new Set(['src/services/articleService.js', 'src/app.js'])
const passed = (spec: Spec) => Object.fromEntries(fixedChecks(spec, INTENT, FILES).map((check) => [check.name, check.pass]))

describe('fixedChecks', () => {
  it('passes a spec that fits the fixture and the intent', () => {
    expect(fixedChecks(SPEC, INTENT, FILES).every((check) => check.pass)).toBe(true)
  })

  it('fails for a missing file that is not marked new, and accepts a leading ./', () => {
    const spec = { ...SPEC, affectedFiles: [{ path: './src/app.js', change: 'x', isNew: false }, { path: 'src/nope.js', change: 'x', isNew: false }] }
    const check = fixedChecks(spec, INTENT, FILES).find((c) => c.name === 'Betroffene Dateien existieren')
    expect(check).toEqual({ name: 'Betroffene Dateien existieren', pass: false, detail: 'fehlen: src/nope.js' })
  })

  it('fails for fewer acceptance than success criteria, code blocks and missing alternatives', () => {
    expect(passed({ ...SPEC, acceptanceCriteria: ['eins'] })['Akzeptanz- ≥ Erfolgskriterien']).toBe(false)
    expect(passed({ ...SPEC, dataFlow: 'So:\n```js\nfoo()\n```' })['Kein Code-Block']).toBe(false)
    expect(passed({ ...SPEC, approach: { ...SPEC.approach, alternatives: [{ name: 'X', reason: ' ' }] } })['Verworfene Alternative mit Grund']).toBe(false)
  })
})

describe('JudgeVerdictSchema', () => {
  const scores = RUBRIC.map((criterion) => ({ criterion: criterion.id, score: 4, reason: 'gut' }))

  it('accepts one score per criterion', () => {
    expect(JudgeVerdictSchema.safeParse({ scores, coverage: [] }).success).toBe(true)
  })

  it('rejects missing or duplicate criteria and scores outside 1–5', () => {
    expect(JudgeVerdictSchema.safeParse({ scores: scores.slice(1), coverage: [] }).success).toBe(false)
    expect(JudgeVerdictSchema.safeParse({ scores: [...scores, scores[0]], coverage: [] }).success).toBe(false)
    expect(JudgeVerdictSchema.safeParse({ scores: [{ ...scores[0], score: 6 }, ...scores.slice(1)], coverage: [] }).success).toBe(false)
  })

  it('reports the criteria below the threshold by name', () => {
    const verdict = JudgeVerdictSchema.parse({ scores: [{ ...scores[0], score: 2, reason: 'lückenhaft' }, ...scores.slice(1)], coverage: [] })
    expect(failedScores(verdict, 3)).toEqual([{ name: 'Abdeckung', score: 2, reason: 'lückenhaft' }])
    expect(failedScores(verdict, 2)).toEqual([])
  })
})

describe('buildJudgePrompt', () => {
  it('contains every criterion, intent, spec and codebase and asks for JSON only', () => {
    const prompt = buildJudgePrompt({ intentMarkdown: '# Intent-Text', specMarkdown: '# Spec-Text', fixtureOverview: 'src/app.js' })
    for (const criterion of RUBRIC) {
      expect(prompt).toContain(`- ${criterion.id} (${criterion.name}):`)
    }
    expect(prompt).toContain('## Intent\n\n# Intent-Text')
    expect(prompt).toContain('## Spec\n\n# Spec-Text')
    expect(prompt).toContain('## Codebase\n\nsrc/app.js')
    expect(prompt).toContain('Antworte ausschließlich mit einem JSON-Objekt')
  })
})
````

Ändern: `packages/core/src/architecture.test.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -104,7 +104,7 @@ describe('architecture (packages/core)', { timeout: ARCHITECTURE_TIMEOUT_MS }, (
 
   // evals/ starts real `claude` processes (npm run eval:guard) and may use src; src and hooks never use evals.
   it('the evals are where the rule looks for them', () => {
-    expect(readdirSync(path.resolve(__dirname, '../evals'))).toContain('guard.eval.ts')
+    expect(readdirSync(path.resolve(__dirname, '../evals'))).toEqual(expect.arrayContaining(['guard.eval.ts', 'spec.eval.ts']))
   })
 
   it('neither src nor the hook scripts import the evals', async () => {
```

- [ ] **Step 2: Tests laufen lassen — sie schlagen fehl**

```bash
npx vitest run --root packages/core evals/specRubric.test.ts
```

Erwartet: FAIL — „No test files found“ (Vitest schließt `evals/**` noch aus); nach der Konfig-Änderung in Step 3 schlüge es mit `Failed to load url ./specRubric` fehl.

- [ ] **Step 3: Implementieren**

Reihenfolge: zuerst `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs`, dann Fixture, `specCases.ts`, `specRubric.ts`, `spec.eval.ts`, Skripte, Architekturtest.

Ändern: `package.json` (Diff gegen den Stand vor diesem Task)

```diff
@@ -11,6 +11,7 @@
     "build": "npm run build --workspaces --if-present",
     "test": "npm run test --workspaces --if-present",
     "lint": "npm run lint --workspaces --if-present",
-    "eval:guard": "npm run eval:guard -w packages/core"
+    "eval:guard": "npm run eval:guard -w packages/core",
+    "eval:spec": "npm run eval:spec -w packages/core"
   }
 }
```

Ändern: `packages/core/eslint.config.mjs` (Diff gegen den Stand vor diesem Task)

```diff
@@ -10,6 +10,8 @@ import { defineConfig } from 'eslint/config'
 // Fast editor feedback only — the wider dependency rules (layers, adapters among each other, src/testing,
 // cycles, web → core entry point) are covered by the ArchUnitTS architecture tests (src/architecture.test.ts).
 export default defineConfig([
+  // Fixture repos of the evals are data (a sample target repo), not code of this package.
+  { ignores: ['evals/fixtures/**'] },
   {
     files: ['src/domain/**/*.ts', 'src/ports/**/*.ts', 'src/application/**/*.ts'],
     ignores: ['**/*.test.ts'],
```

Neu: `packages/core/evals/fixtures/articles-api/README.md`

```markdown
# Articles API

Kleine Blog-API: Artikel anlegen, auflisten, lesen und löschen. Express, Daten im Speicher.

- `GET /api/articles` — alle Artikel, neueste zuerst
- `GET /api/articles/:slug` — ein Artikel
- `POST /api/articles` — Artikel anlegen (`title`, `body`, `author`)
- `DELETE /api/articles/:slug` — Artikel löschen

Aufbau: `src/routes` (HTTP), `src/services` (Fachlogik), `src/store` (Speicher). Tests mit `node --test`.
```

Neu: `packages/core/evals/fixtures/articles-api/package.json`

```json
{
  "name": "articles-api",
  "version": "1.0.0",
  "private": true,
  "description": "Kleine Blog-API mit Artikeln (Fixture für den Spec-Eval)",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.21.0"
  }
}
```

Neu: `packages/core/evals/fixtures/articles-api/src/app.js`

```js
const express = require('express')
const articlesRouter = require('./routes/articles')

const app = express()
app.use(express.json())
app.use('/api/articles', articlesRouter)

app.use((err, req, res, next) => {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
})

if (require.main === module) {
  app.listen(process.env.PORT || 3000)
}

module.exports = app
```

Neu: `packages/core/evals/fixtures/articles-api/src/routes/articles.js`

```js
const express = require('express')
const articleService = require('../services/articleService')

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ articles: articleService.listArticles() })
})

router.get('/:slug', (req, res, next) => {
  try {
    res.json({ article: articleService.getArticle(req.params.slug) })
  } catch (err) {
    next(err)
  }
})

router.post('/', (req, res, next) => {
  try {
    res.status(201).json({ article: articleService.createArticle(req.body) })
  } catch (err) {
    next(err)
  }
})

router.delete('/:slug', (req, res, next) => {
  try {
    articleService.deleteArticle(req.params.slug)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

Neu: `packages/core/evals/fixtures/articles-api/src/services/articleService.js`

```js
const store = require('../store/articleStore')

class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.status = 404
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.status = 422
  }
}

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Shape of an article in API responses. */
function toResponse(article) {
  return {
    slug: article.slug,
    title: article.title,
    body: article.body,
    author: article.author,
    createdAt: article.createdAt.toISOString(),
  }
}

function listArticles() {
  return store.all()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toResponse)
}

function getArticle(slug) {
  const article = store.find(slug)
  if (!article) {
    throw new NotFoundError(`Artikel ${slug} nicht gefunden`)
  }
  return toResponse(article)
}

function createArticle(input) {
  if (!input || !input.title || !input.body || !input.author) {
    throw new ValidationError('title, body und author sind erforderlich')
  }
  const article = { slug: slugify(input.title), title: input.title, body: input.body, author: input.author, createdAt: new Date() }
  store.save(article)
  return toResponse(article)
}

function deleteArticle(slug) {
  if (!store.remove(slug)) {
    throw new NotFoundError(`Artikel ${slug} nicht gefunden`)
  }
}

module.exports = { listArticles, getArticle, createArticle, deleteArticle, NotFoundError, ValidationError }
```

Neu: `packages/core/evals/fixtures/articles-api/src/store/articleStore.js`

```js
/** In-memory store of articles, keyed by slug. */
const articles = new Map()

module.exports = {
  all: () => [...articles.values()],
  find: (slug) => articles.get(slug) || null,
  save: (article) => {
    articles.set(article.slug, article)
  },
  remove: (slug) => articles.delete(slug),
  clear: () => articles.clear(),
}
```

Neu: `packages/core/evals/spec.eval.ts`

```ts
// Spec quality eval (spec of stage 2, §9): the real spec agent — same sandbox, skill and schema as the app
// (`STAGE_AGENTS.design` via `runAgent`) — writes a spec per case against the fixture repo `fixtures/articles-api`,
// started with 0 questions left. Fixed checks (no model) plus a judge model scoring the rubric of specRubric.ts.
// The printed report is German (it is read by the user like the rest of the app).
//
// Run: `npm run eval:spec` (repo root). Needs `claude login`, costs about 0.20–0.40 USD (Sonnet + Haiku).
// Not part of `npm test`. Models: `EVAL_MODEL` (spec agent, default Sonnet), `EVAL_JUDGE_MODEL` (judge, default
// Haiku); threshold: `EVAL_MIN_SCORE` (default 3). New case: add it to SPEC_CASES in specCases.ts.
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SpecSchema, type Spec } from '@refinement/shared'
import { createAgentSandbox, createHookLogFile, hookSettings, sandboxEnv } from '../src/adapters/agentSandbox/agentSandbox'
import { STAGE_AGENTS, runAgent } from '../src/adapters/claudeCli'
import { extractJsonString } from '../src/adapters/claudeCli/agentOutput'
import { renderIntent, renderSpec } from '../src/domain/render'
import { artifactPath } from '../src/domain/artifacts'
import { describeError } from '../src/domain/errors'
import { FIXTURE_NAME, SPEC_CASES, type SpecEvalCase } from './specCases'
import {
  DEFAULT_MIN_SCORE, JudgeVerdictSchema, buildJudgePrompt, failedScores, fixedChecks, type CheckResult, type JudgeVerdict,
} from './specRubric'

const MODEL = process.env.EVAL_MODEL || 'claude-sonnet-4-6'
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'claude-haiku-4-5-20251001'
const MIN_SCORE = Number(process.env.EVAL_MIN_SCORE || DEFAULT_MIN_SCORE)
const AGENT_TIMEOUT_MS = 600_000
const JUDGE_TIMEOUT_MS = 180_000
const CORE_DIR = path.resolve(__dirname, '..')
const HOOKS_DIR = path.join(CORE_DIR, 'hooks')
const SKILLS_DIR = path.join(CORE_DIR, 'skills')
const FIXTURE_DIR = path.join(__dirname, 'fixtures', FIXTURE_NAME)
/** The judge gets no tools: everything is in its prompt. The guard hooks and an empty cwd back this up. */
const JUDGE_DISALLOWED_TOOLS = 'Bash,Read,Glob,Grep,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task'

/** Outcome of one case for the report. */
interface CaseReport {
  key: string
  checks: CheckResult[]
  verdict: JudgeVerdict | null
  costUsd: number
  seconds: number
}

/** Paths of the fixture repo, relative and `/`-separated. */
function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative]
  })
}

/** Every fixture file with its content — the judge's view of the codebase. */
function fixtureOverview(files: string[]): string {
  return files.map((file) => `### ${file}\n\n${fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8').trim()}`).join('\n\n')
}

/** Temp git repo: the fixture plus the merged intent under `docs/work/<KEY>/intent.md`; realpath like the guard's. */
function createTempRepo(evalCase: SpecEvalCase, intentMarkdown: string): string {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'spec-eval-')))
  fs.cpSync(FIXTURE_DIR, repo, { recursive: true })
  const intentFile = path.join(repo, artifactPath(evalCase.key, 'plan'))
  fs.mkdirSync(path.dirname(intentFile), { recursive: true })
  fs.writeFileSync(intentFile, intentMarkdown)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.com', ...args], { cwd: repo })
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'init')
  return repo
}

/** Runs the design agent like the app does, with no questions left; returns its spec or null plus the cost. */
async function runSpecAgent(evalCase: SpecEvalCase, repo: string, intentMarkdown: string): Promise<{ spec: Spec | null; detail: string; costUsd: number }> {
  const sandbox = createAgentSandbox({ hooksDir: HOOKS_DIR })
  try {
    const { output, meta } = await runAgent({
      ticketKey: evalCase.key, stage: 'design', title: evalCase.title, description: evalCase.description,
      repoDir: repo, model: MODEL, intent: intentMarkdown, answeredQuestions: [], questionsRemaining: 0,
    }, { onProgress: () => {}, onToolEvent: () => {} }, { skillsDir: SKILLS_DIR, sandbox, timeoutMs: AGENT_TIMEOUT_MS })
    if (output.type !== 'spec') {
      return { spec: null, detail: `Agent lieferte „${output.type}“ statt einer Spec`, costUsd: meta.costUsd }
    }
    return { spec: SpecSchema.parse(output.result), detail: 'Spec geliefert', costUsd: meta.costUsd }
  } catch (err) {
    return { spec: null, detail: describeError(err), costUsd: 0 }
  }
}

/** Calls the judge model without tools; returns its verdict (or the error), its cost and whether it used tools. */
async function judge(prompt: string): Promise<{ verdict: JudgeVerdict | null; detail: string; costUsd: number; toolCalls: number }> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-judge-'))
  const hookLog = await createHookLogFile()
  try {
    const args = [
      '--print', '--output-format', 'json', '--model', JUDGE_MODEL,
      '--setting-sources', 'user', '--settings', hookSettings(HOOKS_DIR), '--disallowedTools', JUDGE_DISALLOWED_TOOLS,
    ]
    const proc = spawnSync('claude', args, { cwd, env: sandboxEnv(process.env, hookLog.path), input: prompt, encoding: 'utf-8', timeout: JUDGE_TIMEOUT_MS })
    const toolCalls = fs.readFileSync(hookLog.path, 'utf-8').split('\n').filter(Boolean).length
    let result: { result?: string; total_cost_usd?: number; is_error?: boolean }
    try {
      result = JSON.parse(proc.stdout ?? '') as typeof result
    } catch {
      return { verdict: null, detail: `Bewerter ohne gültige Ausgabe: ${(proc.stderr ?? '').slice(0, 300)}`, costUsd: 0, toolCalls }
    }
    const parsed = JudgeVerdictSchema.safeParse(safeJson(extractJsonString(result.result ?? '')))
    const costUsd = result.total_cost_usd ?? 0
    if (result.is_error || !parsed.success) {
      return { verdict: null, detail: `Bewertung unlesbar: ${(result.result ?? '').slice(0, 300)}`, costUsd, toolCalls }
    }
    return { verdict: parsed.data, detail: 'bewertet', costUsd, toolCalls }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
    await hookLog.cleanup()
  }
}

/** JSON.parse that returns undefined instead of throwing (the schema check reports the failure). */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function runCase(evalCase: SpecEvalCase, files: string[]): Promise<CaseReport> {
  const started = Date.now()
  const intentMarkdown = renderIntent({ key: evalCase.key, sourcePath: `examples/tickets/${evalCase.key.toLowerCase()}.md` }, evalCase.intent, [])
  const repo = createTempRepo(evalCase, intentMarkdown)
  try {
    const agent = await runSpecAgent(evalCase, repo, intentMarkdown)
    const checks: CheckResult[] = [{ name: 'Spec direkt geliefert (Schema)', pass: agent.spec !== null, detail: agent.detail }]
    if (!agent.spec) {
      return { key: evalCase.key, checks, verdict: null, costUsd: agent.costUsd, seconds: Math.round((Date.now() - started) / 1000) }
    }
    checks.push(...fixedChecks(agent.spec, evalCase.intent, new Set(files)))
    const specMarkdown = renderSpec({ key: evalCase.key, sourcePath: `examples/tickets/${evalCase.key.toLowerCase()}.md` }, agent.spec, [])
    const judged = await judge(buildJudgePrompt({ intentMarkdown, specMarkdown, fixtureOverview: fixtureOverview(files) }))
    checks.push({ name: 'Bewertung gelesen', pass: judged.verdict !== null, detail: judged.detail })
    checks.push({ name: 'Bewerter ohne Werkzeuge', pass: judged.toolCalls === 0, detail: `${judged.toolCalls} Aufrufe` })
    return {
      key: evalCase.key, checks, verdict: judged.verdict,
      costUsd: agent.costUsd + judged.costUsd, seconds: Math.round((Date.now() - started) / 1000),
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
}

/** Prints the German report of one case; returns the number of failed checks and scores. */
function printCase(report: CaseReport): number {
  console.log(`\n${report.key} · ${report.seconds} s · ${report.costUsd.toFixed(4)} USD`)
  for (const check of report.checks) {
    console.log(`  ${check.name.padEnd(36)}${check.detail.slice(0, 60).padEnd(62)}${check.pass ? '✓' : '✗'}`)
  }
  const failedChecks = report.checks.filter((check) => !check.pass).length
  if (!report.verdict) {
    return failedChecks
  }
  const failed = failedScores(report.verdict, MIN_SCORE)
  for (const score of report.verdict.scores) {
    const pass = score.score >= MIN_SCORE
    console.log(`  ${`Bewertung ${score.criterion}`.padEnd(36)}${`${score.score}/5 — ${score.reason}`.slice(0, 60).padEnd(62)}${pass ? '✓' : '✗'}`)
  }
  for (const entry of report.verdict.coverage) {
    console.log(`    ${entry.successCriterion} → ${entry.acceptanceCriteria.join(' | ') || '—'}`)
  }
  return failedChecks + failed.length
}

async function main(): Promise<number> {
  const files = listFiles(FIXTURE_DIR)
  console.log(`Spec-Eval · Agent ${MODEL} (${STAGE_AGENTS.design.skillFile}) · Bewerter ${JUDGE_MODEL} · Schwelle ${MIN_SCORE}/5`)
  let failures = 0
  let totalCost = 0
  const started = Date.now()
  for (const evalCase of SPEC_CASES) {
    const report = await runCase(evalCase, files)
    failures += printCase(report)
    totalCost += report.costUsd
  }
  console.log(`\nGesamt: ${totalCost.toFixed(4)} USD · ${Math.round((Date.now() - started) / 1000)} s`)
  if (failures > 0) {
    console.log(`${failures} Prüfung(en) oder Bewertung(en) fehlgeschlagen.`)
    return 1
  }
  console.log('Alle Prüfungen bestanden.')
  return 0
}

void main().then((code) => {
  process.exitCode = code
})
```

Neu: `packages/core/evals/specCases.ts`

```ts
import type { Intent } from '@refinement/shared'

// Cases of the spec eval (`npm run eval:spec`): merged intents against the fixture repo `fixtures/articles-api`.
// New case: add an entry (key, ticket title and text, intent with 2–4 success criteria).

/** One eval case: a ticket of the fixture repo and the intent the spec agent starts from. */
export interface SpecEvalCase {
  /** Ticket key, also the folder `docs/work/<key>/` of the intent in the temp repo. */
  key: string
  title: string
  description: string
  intent: Intent
}

/** Fixture repo the cases run against (folder under `evals/fixtures/`). */
export const FIXTURE_NAME = 'articles-api'

export const SPEC_CASES: SpecEvalCase[] = [
  {
    key: 'EVAL-1',
    title: 'Lesezeit bei Artikeln anzeigen',
    description: 'Leser möchten vor dem Öffnen eines Artikels sehen, wie lange das Lesen ungefähr dauert.',
    intent: {
      title: 'Lesezeit anzeigen',
      problem: 'Leser wissen vor dem Öffnen nicht, wie lange ein Artikel dauert, und brechen lange Artikel ab.',
      desiredOutcome: 'Zu jedem Artikel ist eine geschätzte Lesezeit in Minuten sichtbar.',
      successCriteria: [
        'Leser sehen in der Artikelliste zu jedem Artikel, wie lange das Lesen ungefähr dauert.',
        'Leser sehen die Lesezeit auch in der Einzelansicht eines Artikels.',
        'Die angezeigte Lesezeit passt spürbar zur Länge des Artikels.',
      ],
      affected: ['Leser', 'Artikel-API'],
      openPoints: [],
    },
  },
  {
    key: 'EVAL-2',
    title: 'Entwürfe für Artikel',
    description: 'Autoren wollen Artikel als Entwurf speichern und erst später veröffentlichen.',
    intent: {
      title: 'Artikel als Entwurf speichern',
      problem: 'Autoren müssen Artikel sofort veröffentlichen; halbfertige Texte landen bei allen Lesern.',
      desiredOutcome: 'Autoren speichern Artikel als Entwurf und veröffentlichen sie, wenn sie fertig sind.',
      successCriteria: [
        'Autoren können einen Artikel speichern, ohne dass Leser ihn sehen.',
        'Autoren können einen Entwurf veröffentlichen; danach sehen ihn alle Leser.',
        'Leser finden in der Artikelliste keine Entwürfe.',
      ],
      affected: ['Autoren', 'Leser', 'Artikel-API'],
      openPoints: [{ question: 'Sollen Autoren eine Liste ihrer eigenen Entwürfe sehen?' }],
    },
  },
]
```

Neu: `packages/core/evals/specRubric.ts`

````ts
import { z } from 'zod'
import type { Intent, Spec } from '@refinement/shared'

// Rubric of the spec eval (`npm run eval:spec`): fixed checks without a model and the criteria the judge model
// scores. Pure functions, unit-tested in specRubric.test.ts; texts are German (they reach the report and the judge).

/** A judge score below this fails the eval (scores are 1–5). Override with `EVAL_MIN_SCORE`. */
export const DEFAULT_MIN_SCORE = 3

/** Criteria the judge scores, each 1–5 with a reason. */
export const RUBRIC = [
  { id: 'coverage', name: 'Abdeckung', question: 'Ist jedes Erfolgskriterium des Intents durch mindestens ein prüfbares Akzeptanzkriterium abgedeckt?' },
  { id: 'testability', name: 'Prüfbarkeit', question: 'Sind die Akzeptanzkriterien beobachtbar und eindeutig prüfbar?' },
  { id: 'codebaseFit', name: 'Passung zur Codebase', question: 'Nutzen Ansatz und Komponenten die vorhandenen Muster und Dateien der Codebase?' },
  { id: 'yagni', name: 'YAGNI', question: 'Enthält die Spec nur, was der Intent verlangt (keine zusätzlichen Funktionen)?' },
  { id: 'consistency', name: 'Konsistenz', question: 'Decken die Tests die Akzeptanzkriterien ab, und hat jedes Risiko eine Gegenmaßnahme?' },
] as const

/** Id of a rubric criterion. */
export type RubricId = (typeof RUBRIC)[number]['id']

const RUBRIC_IDS = RUBRIC.map((criterion) => criterion.id) as [RubricId, ...RubricId[]]

/** Answer of the judge: one score per criterion and the mapping success criterion → acceptance criteria. */
export const JudgeVerdictSchema = z.object({
  scores: z.array(z.object({
    criterion: z.enum(RUBRIC_IDS),
    score: z.number().int().min(1).max(5),
    reason: z.string(),
  })).refine(
    (scores) => RUBRIC_IDS.every((id) => scores.filter((score) => score.criterion === id).length === 1),
    'Jedes Kriterium braucht genau eine Bewertung',
  ),
  coverage: z.array(z.object({ successCriterion: z.string(), acceptanceCriteria: z.array(z.string()) })),
})
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>

/** Result of one fixed check: German name, pass/fail and what was found. */
export interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

/** Every string inside a value (recursively), to search all text fields of the spec at once. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.flatMap(allStrings)
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(allStrings)
  }
  return []
}

/**
 * Checks that need no model: affected files exist unless marked new, at least as many acceptance criteria as
 * success criteria, no code blocks, at least one dropped alternative with a reason.
 * @param fixtureFiles - Paths of the fixture repo, relative and `/`-separated.
 */
export function fixedChecks(spec: Spec, intent: Intent, fixtureFiles: ReadonlySet<string>): CheckResult[] {
  const missing = spec.affectedFiles
    .filter((file) => !file.isNew && !fixtureFiles.has(file.path.replace(/^\.\//, '')))
    .map((file) => file.path)
  const withCode = allStrings(spec).filter((text) => text.includes('```'))
  const alternatives = spec.approach.alternatives.filter((alt) => alt.name.trim() && alt.reason.trim())
  return [
    {
      name: 'Betroffene Dateien existieren',
      pass: missing.length === 0,
      detail: missing.length ? `fehlen: ${missing.join(', ')}` : `${spec.affectedFiles.length} Dateien`,
    },
    {
      name: 'Akzeptanz- ≥ Erfolgskriterien',
      pass: spec.acceptanceCriteria.length >= intent.successCriteria.length,
      detail: `${spec.acceptanceCriteria.length} ≥ ${intent.successCriteria.length}`,
    },
    {
      name: 'Kein Code-Block',
      pass: withCode.length === 0,
      detail: withCode.length ? `${withCode.length} Felder mit Code-Block` : 'keiner',
    },
    {
      name: 'Verworfene Alternative mit Grund',
      pass: alternatives.length > 0,
      detail: `${alternatives.length}`,
    },
  ]
}

/** German prompt of the judge: rubric, intent, spec and fixture overview; the answer is one JSON object. */
export function buildJudgePrompt(input: { intentMarkdown: string; specMarkdown: string; fixtureOverview: string }): string {
  return [
    'Du bewertest eine technische Spec (Stufe Design) gegen ihren Intent und die Codebase. Nutze keine Werkzeuge;',
    'alles Nötige steht in diesem Text.',
    '',
    '## Kriterien (je 1 = schlecht bis 5 = sehr gut)',
    ...RUBRIC.map((criterion) => `- ${criterion.id} (${criterion.name}): ${criterion.question}`),
    '',
    '## Intent',
    '',
    input.intentMarkdown.trim(),
    '',
    '## Spec',
    '',
    input.specMarkdown.trim(),
    '',
    '## Codebase',
    '',
    input.fixtureOverview.trim(),
    '',
    '## Antwort',
    '',
    'Antworte ausschließlich mit einem JSON-Objekt, ohne Text davor oder danach:',
    '{ "scores": [{ "criterion": "<id>", "score": <1–5>, "reason": "<ein Satz>" }],',
    '  "coverage": [{ "successCriterion": "<Erfolgskriterium>", "acceptanceCriteria": ["<Akzeptanzkriterium, das es abdeckt>"] }] }',
    `Je Kriterium genau ein Eintrag in scores (${RUBRIC_IDS.join(', ')}); je Erfolgskriterium ein Eintrag in coverage.`,
  ].join('\n')
}

/** Criteria scored below `minScore`, with their German names; empty when all pass. */
export function failedScores(verdict: JudgeVerdict, minScore: number): { name: string; score: number; reason: string }[] {
  return verdict.scores
    .filter((score) => score.score < minScore)
    .map((score) => ({ name: RUBRIC.find((criterion) => criterion.id === score.criterion)!.name, score: score.score, reason: score.reason }))
}
````

Ändern: `packages/core/package.json` (Diff gegen den Stand vor diesem Task)

```diff
@@ -8,7 +8,8 @@
     "test": "vitest run",
     "test:watch": "vitest",
     "lint": "eslint src evals 'hooks/**/*.mjs'",
-    "eval:guard": "tsx evals/guard.eval.ts"
+    "eval:guard": "tsx evals/guard.eval.ts",
+    "eval:spec": "tsx evals/spec.eval.ts"
   },
   "dependencies": {
     "@anthropic-ai/claude-code": "^2.1.175",
```

Ändern: `packages/core/tsconfig.json` (Diff gegen den Stand vor diesem Task)

```diff
@@ -12,5 +12,6 @@
     "allowJs": true,
     "checkJs": true
   },
-  "include": ["src", "hooks", "evals"]
+  "include": ["src", "hooks", "evals"],
+  "exclude": ["evals/fixtures"]
 }
```

Ändern: `packages/core/vitest.config.ts` (Diff gegen den Stand vor diesem Task)

```diff
@@ -4,7 +4,8 @@ export default defineConfig({
   test: {
     // ArchUnitTS registers its `toPassAsync()` matcher on the global `expect` (src/architecture.test.ts).
     globals: true,
-    // Evals (evals/*.eval.ts) start a real `claude` and cost money — only via `npm run eval:guard`.
-    exclude: ['node_modules/**', 'evals/**'],
+    // Evals (evals/*.eval.ts) start a real `claude` and cost money — only via `npm run eval:guard` / `eval:spec`.
+    // Their pure helpers (e.g. evals/specRubric.test.ts) run with `npm test`; the fixture repos are data, not tests.
+    exclude: ['node_modules/**', 'evals/**/*.eval.ts', 'evals/fixtures/**'],
   },
 })
```

- [ ] **Step 4: Tests und Prüfungen laufen lassen — grün**

```bash
npx vitest run --root packages/core evals/specRubric.test.ts src/architecture.test.ts
npm test && npm run build && npm run lint
```

Erwartet: 7 Rubrik-Tests und die Architekturtests grün; `npm test` führt keine `*.eval.ts` aus; danach alle Workspaces grün (Vitest, `tsc --noEmit` + `next build`, ESLint).

- [ ] **Step 5: Commit**

```bash
git add -A package.json packages/core/eslint.config.mjs packages/core/evals/fixtures/articles-api/README.md packages/core/evals/fixtures/articles-api/package.json packages/core/evals/fixtures/articles-api/src/app.js packages/core/evals/fixtures/articles-api/src/routes/articles.js packages/core/evals/fixtures/articles-api/src/services/articleService.js packages/core/evals/fixtures/articles-api/src/store/articleStore.js packages/core/evals/fixtures/articles-api/test/articles.test.js packages/core/evals/spec.eval.ts packages/core/evals/specCases.ts packages/core/evals/specRubric.test.ts packages/core/evals/specRubric.ts packages/core/package.json packages/core/src/architecture.test.ts packages/core/tsconfig.json packages/core/vitest.config.ts
git commit -m "feat(core): Spec-Eval mit Fixture-Repo, festen Prüfungen und Bewerter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 14: Doku (Spec §10)

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/datenmodell.md`
- Modify: `docs/ui-ux-concept.md`
- Modify: `docs/feature-roadmap.md`
- Modify: `docs/superpowers/specs/2026-10-28-playbook-stages-design.md`

Kein Code, keine Tests; jede Ersetzung unten nennt den bisherigen Text (wörtlich) und den neuen. Historische
Specs und Pläne außer der Playbook-Stufen-Spec bleiben unverändert. Produkt-, Paket- und Variablennamen mit
„Refinement“ (`Refinement Engine`, `@refinement/*`, `REFINEMENT_TIMEOUT_MS`, `REFINEMENT_HOOK_LOG`,
`refinement.db`, `createRefinementEngine`) bleiben — sie sind Namen, keine Altlast des alten Refine-Agents.

- [ ] **Step 1: `README.md`**

Ersetze

```markdown
Stand: Stufe 1 (Plan) läuft Ende zu Ende. Stufe 2 (Design) folgt.
```

durch

```markdown
Stand: Stufe 1 (Plan) und Stufe 2 (Design) laufen Ende zu Ende.
```

Ersetze die Überschrift `## Ablauf (Stufe 1)` durch `## Ablauf (Stufe 1: Plan)` und füge **nach** dem Absatz, der mit
„Ein Lauf nutzt den eigenen Claude-Login“ beginnt (vor `## Leitplanken für den Agent`), ein:

```markdown
## Ablauf (Stufe 2: Design)

1. Ticket in der Spalte „2 Design“ öffnen (der Intent ist gemergt), Modell wählen, **Design starten**.
2. Die App liest `docs/work/<TICKET>/intent.md` von `showcase` (fehlt er: „Intent fehlt auf showcase — erst Stufe 1
   abschließen“) und stellt den Klon des Ziel-Repos auf den aktuellen Stand von `showcase`.
3. Der Design-Agent liest Intent und Codebase. Gibt es echte Alternativen, bietet er eine **Auswahl** mit 2–3
   Ansätzen an (Vor- und Nachteile, eine Empfehlung ist vorausgewählt, optional eine Anmerkung); fehlt eine
   fachliche Regel, stellt er eine **Rückfrage**. Höchstens **3** Rückfragen/Auswahlen pro Start („Rückfrage N von
   3“); danach muss er die Spec liefern, sonst endet der Lauf mit „Rückfragen-Grenze erreicht …“ und lässt sich neu
   starten.
4. Die App legt `docs/work/<TICKET>/spec.md` auf dem Branch `<TICKET>/spec` an und öffnet den PR `<TICKET>: Spec`
   gegen `showcase`. Gewählte Ansätze stehen unter „Geklärte Rückfragen“ („Ansatz B: … — Anmerkung: …“).
5. **Mergen** setzt das Ticket auf „Fertig“; die Spec ist in der App unter „Stufen“ sichtbar.
```

Ersetze im Abschnitt „Leitplanken für den Agent“ den Absatz, der mit ``**Eval.** `npm run eval:guard` `` beginnt, durch
denselben Absatz plus einen zweiten:

```markdown
**Spec-Eval.** `npm run eval:spec` prüft die Qualität der Specs mit dem echten Design-Agent (gleiche Sandbox, gleicher
Skill, gleiches Schema wie die App) gegen ein kleines Beispiel-Repo (`packages/core/evals/fixtures/articles-api`) und
zwei Intents, ohne Rückfragen. Feste Prüfungen: Spec geliefert, betroffene Dateien existieren (außer als neu
markierte), mindestens so viele Akzeptanz- wie Erfolgskriterien, kein Code-Block, eine verworfene Alternative mit
Grund. Danach bewertet ein zweites Modell (Haiku, ohne Werkzeuge) Abdeckung, Prüfbarkeit, Passung zur Codebase,
YAGNI und Konsistenz mit 1–5; unter 3 (`EVAL_MIN_SCORE`) schlägt der Eval fehl. Ausgabe als Tabelle mit Kosten und
Dauer, etwa 0,20–0,40 $ pro Lauf (`EVAL_MODEL`, `EVAL_JUDGE_MODEL`); nicht Teil von `npm test`.
```

Ergänze in der Tabelle unter `## Befehle` nach der Zeile `npm run eval:guard`:

```markdown
| `npm run eval:spec`  | Qualitäts-Eval der Specs mit echtem `claude` (kostet, siehe oben) |
```

- [ ] **Step 2: `CLAUDE.md`**

Ersetze (Zeile 13)

```text
npm run eval:guard   # guard eval: real `claude` (Haiku) in the app sandbox — costs ~5 cents, needs `claude login`
```

durch

```text
npm run eval:guard   # guard eval: real `claude` (Haiku) in the app sandbox — costs ~5 cents, needs `claude login`
npm run eval:spec    # spec quality eval: real spec agent (Sonnet) + judge (Haiku) on a fixture repo — ~0.20–0.40 USD
```

Ersetze

```text
references and a log per ticket. Stage 1 runs end to end; stage 2 (Design) is modelled but not startable yet
(`STARTABLE_STAGES` in `domain/rules.ts`).
```

durch

```text
references and a log per ticket. Both stages run end to end; stage 2 reads the merged intent from `showcase`, may
offer a choice between 2–3 approaches, and asks at most `QUESTION_LIMIT` (3) questions/choices per start.
```

Ersetze

```text
packages/shared/   Zod contracts: DTOs, inputs, TicketEvent, audit events, agent output (IntentSchema; RefinementOutputSchema for stage 2)
```

durch

```text
packages/shared/   Zod contracts: DTOs, inputs, TicketEvent, audit events, agent output (agentOutput: question/choice;
                   IntentSchema; SpecSchema; StageOutputSchema)
```

Ersetze in der AuditEvent-Liste `` `question_asked`, `answer_given`, `` durch `` `question_asked`, `choice_offered`, `answer_given` (optional `choice`), ``.

Ersetze die Überschrift `### Flow ("Plan starten")` durch `### Flow ("Plan starten" / "Design starten")` und die
Schritte 2–4 durch:

```text
2. `runStage`: design only — read `docs/work/<KEY>/intent.md` from `showcase` via `codeHost.readFile` (missing →
   `failed` "Intent fehlt auf showcase — erst Stufe 1 abschließen") → `RepoProvider.ensureRepo(TARGET_REPO)` (clone
   into `$REPO_CACHE_DIR`, then `fetch origin showcase` + `checkout -f -B showcase FETCH_HEAD` + `reset --hard`, no
   token; survives the force-reset of `showcase`) → `ensureSummary` → `executeRun`
3. `AgentRunner.run` (`adapters/claudeCli`) picks skill + schema per stage (`STAGE_AGENTS`: plan →
   `skills/intent-agent.md` + `IntentAgentOutputSchema`; design → `skills/spec-agent.md` + `SpecAgentOutputSchema`),
   builds the prompt (design: intent section and "Du hast noch N von 3 Rückfragen/Auswahlen"), spawns
   `claude --print --output-format stream-json`, validates, retries once on schema errors
4. Question → `awaiting_answer` (`question_asked`); choice (design) → `awaiting_answer` (`choice_offered`). A question
   or choice with 0 left (`questionsRemaining` in `domain/rules.ts`, counted from the latest `initial` run) fails the
   stage. `answerQuestion` takes `{ answer }` or `{ choice, note? }` (stored as "Ansatz B: <Titel> — Anmerkung: …")
   and starts a new run with the Q&A history. Intent → `renderIntent`, spec → `renderSpec`
   → `publishArtifact`: delete leftover branch, create branch, commit file, open PR → artifact + `in_review`
```

Ersetze den Absatz, der mit `**Guard eval (` beginnt, durch denselben Absatz und hänge an:

```text
**Spec eval (`packages/core/evals/spec.eval.ts`, `npm run eval:spec`):** copies the fixture repo
`evals/fixtures/articles-api` into a temp git repo per case (`evals/specCases.ts`, with the intent under
`docs/work/<KEY>/intent.md`), runs the real design agent through `runAgent` (`STAGE_AGENTS.design`, same sandbox and
skill as the app) with `questionsRemaining: 0`, applies the fixed checks of `evals/specRubric.ts` and has a judge model
(`claude --print --output-format json`, no tools: `--disallowedTools`, guard hooks, empty cwd; its hook log must stay
empty) score the rubric 1–5 (JSON, Zod-checked). Models `EVAL_MODEL` (Sonnet) / `EVAL_JUDGE_MODEL` (Haiku), threshold
`EVAL_MIN_SCORE` (3). German report, exit code 1 on failure. `evals/specRubric.test.ts` runs with `npm test`
(`vitest.config.ts` excludes only `evals/**/*.eval.ts` and `evals/fixtures/**`); the fixture is excluded from
`tsconfig`, ESLint and Vitest.
```

Ersetze

```text
- `packages/core/src/adapters/git/` — `repoCache.ts` (clone/pull into the cache, `getRepoDir`, factory),
```

durch

```text
- `packages/core/src/adapters/git/` — `repoCache.ts` (clone into the cache, checkout of the base branch via fetch +
  `checkout -B FETCH_HEAD`, `getRepoDir`, factory with `baseBranch`),
```

Ersetze

```text
- `packages/core/skills/intent-agent.md` — stage 1 skill, included verbatim in the prompt
  (`refinement-agent.md` is kept for stage 2)
```

durch

```text
- `packages/core/skills/intent-agent.md`, `spec-agent.md` — skills of stage 1 and 2, included verbatim in the prompt
```

Ersetze

```text
- **New eval case**: add an entry to `CASES` in `packages/core/evals/guard.eval.ts` (`tool`, `instruction` as written in
  the prompt, `expected: 'blocked' | 'used'`, `matches(target)` recognising the hook-log target), then run
  `npm run eval:guard`
```

durch

```text
- **New eval case**: guard — add an entry to `CASES` in `packages/core/evals/guard.eval.ts` (`tool`, `instruction` as
  written in the prompt, `expected: 'blocked' | 'used'`, `matches(target)` recognising the hook-log target), then run
  `npm run eval:guard`; spec — add an intent to `SPEC_CASES` in `packages/core/evals/specCases.ts` (criteria and
  threshold in `specRubric.ts`), then run `npm run eval:spec`
```

Ersetze ``the eval report (`npm run eval:guard`)`` durch ``the eval reports (`npm run eval:guard`, `eval:spec`)``.

- [ ] **Step 3: `docs/architecture.md`**

Ersetze

```markdown
**Stufe 1 (Plan → `intent.md`) läuft Ende zu Ende; Stufe 2 (Design → `spec.md`) ist modelliert, aber noch
nicht startbar** (§6). Das Übersichtsbild: [architecture.png](architecture.png), erläutert in
```

durch

```markdown
**Stufe 1 (Plan → `intent.md`) und Stufe 2 (Design → `spec.md`) laufen Ende zu Ende** (§6). Das Übersichtsbild:
[architecture.png](architecture.png), erläutert in
```

Ersetze in §3 den Punkt `- **Agent und App:** …` durch:

```markdown
- **Agent und App:** Der Agent liest Ticket und Klon des Ziel-Repos (Stand von `showcase`; in Stufe 2 zusätzlich
  den gemergten Intent) und liefert eine Rückfrage, in Stufe 2 auch eine Auswahl zwischen 2–3 Ansätzen (höchstens
  3 pro Start), oder das Ergebnis; die App rendert daraus die Datei, legt Branch und PR an und führt den Zustand.
```

Ersetze in §5 den Satz `Für Stufe 1 gibt es dafür drei Bausteine, jeder als Code im Repo ([E6](decisions.md)):` durch
`Dafür gibt es vier Bausteine, jeder als Code im Repo ([E6](decisions.md)):` und die Tabellenzeilen „Skill“ und „Eval“ durch:

```markdown
| **Skill** | sagt dem Agent, was er tun soll: Intent bzw. Spec schreiben, zurückfragen oder (Stufe 2) Ansätze zur Wahl stellen, nur lesen | `packages/core/skills/intent-agent.md`, `spec-agent.md` |
| **Eval (Guard)** | prüft mit einem echten `claude` (Haiku), dass der Guard greift: `rm -rf`, Lesen außerhalb und `curl` blockiert, `git log` und Lesen im Repo erlaubt — *darf der Agent das?* | `packages/core/evals/guard.eval.ts`, `npm run eval:guard` |
| **Eval (Spec)** | lässt den echten Spec-Agent gegen ein Beispiel-Repo laufen; feste Prüfungen plus Bewertung durch ein zweites Modell (Abdeckung, Prüfbarkeit, Passung, YAGNI, Konsistenz) — *ist das Ergebnis gut?* | `packages/core/evals/spec.eval.ts`, `npm run eval:spec` |
```

Ersetze in §6 den Block von `**Gebaut (Stufe 1):**` bis einschließlich der Zeile
``- **Ticket-System anbinden:** Jira o. Ä. statt `examples/tickets/*.md`, siehe unten.`` durch:

```markdown
**Gebaut (Stufe 1 und 2):**

- Tickets aus `examples/tickets/*.md`, Schlüssel wie `CB-3` als Primärschlüssel.
- Intent-Agent mit Rückfragen; `intent.md` auf eigenem Branch mit PR gegen `showcase`.
- Spec-Agent auf dem gemergten Intent: Rückfragen und Auswahl zwischen 2–3 Ansätzen (höchstens 3 pro Start),
  `spec.md` auf `<KEY>/spec` mit PR `<KEY>: Spec`; Merge → Fertig.
- Klon des Ziel-Repos auf `showcase` (fetch + `checkout -B`, robust gegen den Force-Reset).
- Merge-Erkennung per Abfrage (Timer und Ticketseite), Inhalt live von `showcase`.
- Log pro Ticket mit Läufen, Rückfragen, Auswahlen, PRs, Übergängen, Kosten und Tokens.
- Aufräumen beim Start, Showcase-Reset (Tag `showcase-base`, Reset-Button, `RESET_ON_START`).
- Leitplanken des Agents: Sandbox, Guard- und Audit-Hooks, Guard-Eval und Spec-Eval (§5).

**Offen:**

- **Sandbox pro Stufe:** spätestens mit Stufe 3 (Build), siehe §5 „Agent-Sandbox“.
- **Ticket-System anbinden:** Jira o. Ä. statt `examples/tickets/*.md`, siehe unten.
```

Ersetze im Glossar (§7) die Zeile `| Spec | … |` durch:

```markdown
| Spec | Design der Lösung aus dem Intent: Ziel, gewählter Ansatz mit verworfenen Alternativen, Komponenten, Datenfluss, Fehlerbehandlung, Akzeptanzkriterien, Tests, betroffene Dateien, Risiken, offene Punkte |
| Auswahl | Ausgabe des Design-Agents statt einer Rückfrage: 2–3 Ansätze mit Vor- und Nachteilen und einer Empfehlung; die Wahl landet als „Ansatz B: … — Anmerkung: …“ in der Spec |
```

- [ ] **Step 4: `docs/datenmodell.md`**

Ersetze den Satz `` `output` ist eine Union über `type` (`packages/shared/src/intentSchema.ts`); Stufe 1 liefert: `` und den
folgenden `text`-Block durch:

````markdown
`output` ist eine Union über `type` (`StageOutputSchema` in `packages/shared/src/stageOutput.ts`); Stufe 1 liefert
`question` oder `intent`, Stufe 2 `question`, `choice` oder `spec`:

```text
{ type: "question", question: string }
{ type: "choice",   question: string, options: Option[], recommended: "A" | "B" | "C" }   // nur Stufe 2
{ type: "intent",   result:   Intent }
{ type: "spec",     result:   Spec }

Option = { id: "A" | "B" | "C", title: string, description: string, pros: string[], cons: string[] }
                                        // 2–3 Optionen, ids eindeutig, recommended ist eine davon

Intent = {
  title:           string               // max. 60 Zeichen
  problem:         string
  desiredOutcome:  string
  successCriteria: string[]             // mind. 1; Erfolgskriterien auf Ergebnisebene
  affected:        string[]
  openPoints:      { question: string }[]
}

Spec = {
  title:              string            // max. 60 Zeichen
  goal:               string            // zugleich Kurzfassung im PR
  approach:           { chosen: string, rationale: string, alternatives: { name: string, reason: string }[] }
  components:         { name: string, purpose: string, interface: string, dependsOn: string[] }[]
  dataFlow:           string
  errorHandling:      string
  acceptanceCriteria: string[]          // mind. 1; deckt jedes Erfolgskriterium des Intents ab
  tests:              string
  affectedFiles:      { path: string, change: string, isNew: boolean }[]
  risks:              { description: string, severity: "low" | "medium" | "high", mitigation: string }[]
  openPoints:         { question: string }[]
}
```
````

Ersetze

```markdown
Die offene Rückfrage eines Tickets ist die `question` des letzten Laufs der aktuellen Stufe.
```

durch

```markdown
Die offene Rückfrage oder Auswahl eines Tickets ist die `question` bzw. `choice` des letzten Laufs der aktuellen Stufe
(`TicketDetailDto.pendingQuestion` / `pendingChoice`). In Stufe 2 zählt die App Rückfragen und Auswahlen ab dem
letzten Lauf mit `trigger: initial` (`questionsAsked`, Grenze `questionLimit` = 3).
```

Ersetze in der Typ-Tabelle des Logs die Zeile ``| `answer_given` | human | `{ answer }` |`` durch:

```markdown
| `choice_offered` | agent | `{ question, options: { id, title }[], recommended }` — Auswahl des Design-Agents |
| `answer_given` | human | `{ answer, choice? }` — bei einer Auswahl ist `answer` „Ansatz B: <Titel> — Anmerkung: …“ und `choice` die id |
```

Ersetze

```markdown
(`STARTABLE_STAGES`, heute nur `plan`)
```

durch

```markdown
(`STARTABLE_STAGES`: `plan` und `design`; `design` braucht den gemergten Intent auf `showcase`)
```

und

```markdown
- **Rückfrage:** Der Agent fragt → `awaiting_answer`. Die Antwort (`answerQuestion`) startet einen neuen Lauf
  mit dem ganzen Q&A-Verlauf.
```

durch:

```markdown
- **Rückfrage/Auswahl:** Der Agent fragt oder bietet (Stufe 2) Ansätze zur Wahl → `awaiting_answer`. Die Antwort
  bzw. Wahl (`answerQuestion`) startet einen neuen Lauf mit dem ganzen Q&A-Verlauf. In Stufe 2 höchstens 3 pro Start;
  eine weitere Rückfrage → `failed` („Rückfragen-Grenze erreicht …“).
```

- [ ] **Step 5: `docs/ui-ux-concept.md`**

Ersetze im Block „Aktionsbereich je Zustand“

```text
awaiting_answer          Karte "Frage vom Agent": Frage, Textfeld, [Antworten]
                         [Abbrechen]
```

durch

```text
awaiting_answer          Karte "Frage vom Agent": (Stufe 2: "Rueckfrage N von 3"), Frage, Textfeld, [Antworten]
                         [Abbrechen]
awaiting_answer,         Karte "Auswahl vom Agent": "Rueckfrage N von 3", Frage als Legende,
Auswahl (Stufe 2)        (o) Ansatz A: Titel  [empfohlen]   Beschreibung, + Vorteile, - Nachteile
                         ( ) Ansatz B: Titel  ...           (Empfehlung vorausgewaehlt, Radio-Gruppe)
                         Anmerkung (optional)
                         [Auswahl senden] [Abbrechen]
```

und

```text
ready, Stufe 2           [Design starten] (deaktiviert)
                         "Der Design-Agent (Stufe 2) folgt im naechsten Schritt."
```

durch

```text
ready / failed, Stufe 2  [Sonnet 4.6 v] [Design starten]
                         "Der Design-Agent liest den gemergten Intent und die Codebase; er stellt hoechstens
                          3 Rueckfragen oder Auswahlen."
```

Füge unter dem Block (vor „Während die App den Zustand abgleicht …“) ein:

```markdown
**`ChoicePanel`:** `fieldset` mit der Frage als `legend`, je Ansatz ein natives Radio (Tab in die Gruppe, Pfeiltasten
wechseln); Beschreibung, Vor- und Nachteile hängen per `aria-describedby` am Radio. „Auswahl senden“ ist aktiv,
sobald eine Option gewählt ist (die Empfehlung ist es von Anfang an). Im Log erscheinen „Auswahl: <Frage> — Ansatz A
empfohlen“ und „Antwort: Ansatz B: <Titel> — Anmerkung: …“.
```

- [ ] **Step 6: `docs/feature-roadmap.md` und Playbook-Stufen-Spec**

`docs/feature-roadmap.md`: In der Tabelle in §4 ersetze in der Zeile „**2 Design**“ `**Showcase (folgt)**` durch
`**Showcase (gebaut)**`. Ersetze in §4 den Absatz `**Stufe 2 — Design.** …` (bis „… an den Policy-Owner.“) durch:

```markdown
**Stufe 2 — Design.** Aus dem freigegebenen Intent und der Codebase schreibt der Agent `spec.md`: Ziel, gewählter
Ansatz mit verworfenen Alternativen, Komponenten, Datenfluss, Fehlerbehandlung, Akzeptanzkriterien, Tests,
betroffene Dateien, Risiken. Wo die Architektur echte Alternativen hat, stellt er 2–3 Ansätze zur Wahl; wo eine
Regel fehlt, fragt er zurück — höchstens dreimal. Der Product Owner gibt per Merge frei, bei höherem Risiko
zusätzlich der Tech Lead; markierte Bedenken gehen an den Policy-Owner. Ein zweiter Eval (`npm run eval:spec`)
bewertet die Qualität der Specs.
```

Ersetze in §6 `**Heute:** Stufe 1 läuft Ende zu Ende über Git.` durch `**Heute:** Stufe 1 und 2 laufen Ende zu Ende über Git.`,
füge nach dem Satz „Der Merge schiebt das Ticket in Stufe 2; …“ den Satz „In Stufe 2 schreibt der Spec-Agent aus dem
gemergten Intent `spec.md` (Branch `<TICKET>/spec`, PR gegen `showcase`); der Merge setzt das Ticket auf Fertig.“ ein
und ersetze den Absatz `**Nächster Schritt:** Stufe 2 (Design) — …` durch:

```markdown
**Nächster Schritt:** Stufe 3 (Build) — `plan.md` und Code-Diff mit eigener Sandbox (Schreibrechte nur im
Arbeitszweig), siehe [Architektur §5](architecture.md#agent-sandbox).
```

`docs/superpowers/specs/2026-10-28-playbook-stages-design.md`: Ersetze in Zeile 3 `Teil B offen` durch
`Teil B umgesetzt nach [Stufe-2-Spec](2026-10-29-playbook-stage-2-design.md)`. Hänge an das Ende von §6 (nach dem
Punkt „Agent liest wie heute den lokalen Klon …“) und an das Ende von §10 (nach dem Punkt „**Teil B — Stufe 2:** …“)
jeweils an:

```markdown
- Nachtrag: Teil B ist im eigenen Spec [2026-10-29-playbook-stage-2-design.md](2026-10-29-playbook-stage-2-design.md)
  beschrieben und abweichend von hier umgesetzt (Spec-Gliederung, Auswahl zwischen Ansätzen, Grenze von 3
  Rückfragen, `RefinementOutputSchema`/`refinement-agent.md` entfallen).
```

- [ ] **Step 7: Reste suchen**

```bash
git grep -n -i "refinement-agent\|RefinementOutput\|AgentOutputSchema\|refinementSchema\|confidence\|noch nicht startbar\|not startable\|Stufe 2 (Design) folgt\|Showcase (folgt)" -- . ':!docs/superpowers/plans' ':!docs/superpowers/specs/2026-10-28-*' ':!docs/superpowers/specs/2026-10-29-*'
```

Erwartet: keine Treffer (historische Pläne/Specs sind ausgenommen). Ein verbleibender Treffer wird im jeweiligen
Dokument im Sinne der Schritte oben angepasst.

- [ ] **Step 8: Prüfen und Commit**

```bash
npm test && npm run build && npm run lint
git add README.md CLAUDE.md docs/architecture.md docs/datenmodell.md docs/ui-ux-concept.md docs/feature-roadmap.md docs/superpowers/specs/2026-10-28-playbook-stages-design.md
git commit -m "docs: Stufe 2 (Design) und Spec-Eval dokumentiert" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Erwartet: grün (Doku ändert keinen Code).

### Task 15: Abschlussprüfung

**Files:** keine Änderungen (außer Korrekturen, falls eine Prüfung scheitert — dann eigener Commit `fix: …`).

- [ ] **Step 1: Alles grün**

```bash
npm test && npm run build && npm run lint
```

Erwartet: alle Workspaces grün; in `packages/core` laufen `designStage.test.ts`, `repoCache.baseBranch.test.ts` und
`evals/specRubric.test.ts` mit, aber keine `*.eval.ts`.

- [ ] **Step 2: Spec-Abdeckung stichprobenartig**

```bash
git grep -n "QUESTION_LIMIT_REACHED\|INTENT_MISSING\|choice_offered\|renderSpec\|spec-agent.md\|FETCH_HEAD\|eval:spec" -- packages apps package.json
```

Erwartet: Treffer in `messages.ts`/`executeRun.ts`/`runStage.ts`, `auditEvents.ts`/`executeRun.ts`/`logFormat.ts`,
`render.ts`/`executeRun.ts`, `claudeCli/index.ts`, `repoCache.ts`, beiden `package.json`.

- [ ] **Step 3: Kostenpflichtige Prüfungen — nur nach Zustimmung des Nutzers**

Den Nutzer fragen, bevor irgendetwas davon läuft (Tokens, PRs im Fork):

```bash
npm run eval:guard   # unverändert grün erwartet (~5 Cent)
npm run eval:spec    # ~0,20–0,40 $; alle festen Prüfungen ✓, jede Bewertung ≥ 3/5
```

Manueller Durchlauf (Spec §11): CB-1 steht in „2 Design“ → „Design starten“ → ggf. Auswahl/Rückfrage beantworten
(Zähler „Rückfrage N von 3“) → PR `CB-1: Spec` auf GitHub prüfen und mergen → Ticket in „Fertig“, Spec-Inhalt unter
„Stufen“ → Reset setzt alles zurück (danach steht CB-1 wieder in der Stufe, die `showcase-base` ergibt).

- [ ] **Step 4: Abschluss**

Kein Push. Ergebnis an den Nutzer melden (Tasks, Testanzahl, ob Evals/Durchlauf gelaufen sind) und
`superpowers:finishing-a-development-branch` anbieten.
