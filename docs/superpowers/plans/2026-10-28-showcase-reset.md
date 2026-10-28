# Repo-Reset über Showcase-Branch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App arbeitet gegen den Branch `showcase` (Ausgangsstand = Tag `showcase-base`) und kann das Ziel-Repo per Force-Reset dieses Branches zurücksetzen — beim Reset-Button immer, beim Start nur mit `RESET_ON_START=true`.

**Architecture:** `CodeHost` bekommt einen konfigurierten Basis-Branch statt des Default-Branches sowie `prepareBaseBranch()` und `resetBaseBranch()`. `startup({ resetRepo })` liefert einen Bericht mit Warnungen; `resetSystem` startet mit `resetRepo: true` und gibt die Warnungen an die UI weiter.

**Tech Stack:** wie Teil A (TypeScript, Octokit v22, Vitest, Next.js 16).

**Spec:** [`§12` in `2026-10-28-playbook-stages-design.md`](../specs/2026-10-28-playbook-stages-design.md#12-nachtrag-repo-reset-über-einen-showcase-branch)

---

## Rahmen

- Branch `feature/playbook-stages`. Ein Commit pro Task, Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: erst Test, dann Code. Nach jedem Task: `npm test`, `npm run build`, `npm run lint` aus der Repo-Wurzel grün.
- Feste Namen in `packages/core/src/compose.ts`: `SHOWCASE_BRANCH = 'showcase'`, `BASELINE_TAG = 'showcase-base'`
  (als Default von `EngineConfig.baseBranch`/`baselineTag`, beide optional).

## Task 1: Port und Fake

**Files:** `packages/core/src/ports/codeHost.ts`, `packages/core/src/testing/fakes.ts`, `fakes.test.ts`

- `CodeHost`: `defaultBranch()` → `baseBranch()` (Name des Basis-Branches). `readFile`, `createBranch`,
  `openPullRequest` beziehen sich auf den Basis-Branch (Doc-Kommentare anpassen). Neu:
  - `prepareBaseBranch(): Promise<{ createdTag: boolean; createdBranch: boolean }>` — fehlt der Tag, auf den Kopf des
    Default-Branches des Repos legen; fehlt der Basis-Branch, auf den Tag legen.
  - `resetBaseBranch(): Promise<void>` — Basis-Branch per Force auf den Commit des Tags.
- `FakeCodeHost`: Modell erweitern um `defaultBranchFiles` (Stand von `master`), `baselineFiles: Map | null` (Tag),
  `files` bleibt der Inhalt des Basis-Branches. `merge()` schreibt in `files` (Basis-Branch). `prepareBaseBranch`
  kopiert `defaultBranchFiles` → Tag (falls `null`) und Tag → `files` nur beim ersten Anlegen (Flag `baseBranchExists`,
  Default `true` für bestehende Tests); `resetBaseBranch` setzt `files` auf eine Kopie des Tags (422, wenn Tag fehlt).
  Beide in `calls` und `failures` wie die anderen Methoden.
- Tests: prepare legt Tag und Branch nur bei Bedarf an; reset stellt den Tag-Stand her; Merge nach Reset ist weg.

## Task 2: GitHub-Adapter

**Files:** `packages/core/src/adapters/github/githubCodeHost.ts`, `githubCodeHost.test.ts`

- Optionen `baseBranch` und `baselineTag` (Pflicht im Adapter). `baseBranch()` gibt den Namen zurück (kein API-Aufruf).
  `readFile` liest mit `ref: baseBranch`; `createBranch` holt die SHA von `heads/<baseBranch>`; PR `base: baseBranch`.
  Der Default-Branch des Repos wird nur noch in `prepareBaseBranch` gelesen (`repos.get`, gecacht).
- `prepareBaseBranch`: `git.getRef('tags/<tag>')`; bei 404 SHA von `heads/<default>` holen und
  `git.createRef('refs/tags/<tag>')` (leichtgewichtiger Tag). Dann `git.getRef('heads/<base>')`; bei 404
  `git.createRef('refs/heads/<base>', sha des Tags)`. Rückgabe, was angelegt wurde.
- `resetBaseBranch`: SHA von `tags/<tag>` holen (404 → `CodeHostError` mit Hinweis „Tag showcase-base fehlt“), dann
  `git.updateRef({ ref: 'heads/<base>', sha, force: true })`. 422 mit „protected“ → Hinweis auf Branch-Schutz.
- Tests (gemocktes `fetch`): Ref-Pfade, `force: true` im Body, PR-Base `showcase`, `?ref=showcase` beim Lesen,
  Tag/Branch werden nur bei 404 angelegt.

## Task 3: Start, Reset, Komposition

**Files:** `packages/core/src/application/startup.ts`, `startup.test.ts`, `createUseCases.ts`, `compose.ts`,
`compose.test.ts`, `packages/core/src/domain/artifacts.ts` (+Test), `queries.ts` (+Test), `packages/shared/src/api.ts`

- `fileUrl(repoUrl, branch, path)` → `…/blob/<branch>/<path>`; `getTicket` nutzt `codeHost.baseBranch()` bzw. ohne
  Token den konfigurierten Namen (`deps.baseBranch: string`, neu in `UseCaseDeps`, aus `EngineConfig`).
- `SettingsDto` um `baseBranch: string` erweitern.
- `startup(deps, { resetRepo = false } = {}): Promise<{ warnings: string[] }>`. Ablauf mit Token:
  1. `prepareBaseBranch()` (Log: Tag/Branch angelegt);
  2. ohne `resetRepo`: `syncReviews`; mit `resetRepo`: entfällt;
  3. offene App-PRs schließen (wie bisher);
  4. nur mit `resetRepo`: App-Branches `<KEY>/intent|spec` aller bekannten Tickets löschen (idempotent, Fehler je
     Branch → Warnung), dann `resetBaseBranch()`, Audit `cleanup` bleibt pro PR; Log-Zeile `[startup] Repo zurückgesetzt`;
  5. Guard `baseBranch()`, Stufen ableiten.
  Jede abgefangene GitHub-Warnung kommt zusätzlich in `warnings`. Ohne Token: Warnung `GITHUB_TOKEN fehlt …` in `warnings`.
- `resetSystem(deps)` → `startup(deps, { resetRepo: true })`, gibt den Bericht zurück. `UseCases.startup(options?)`
  und `UseCases.resetSystem(): Promise<{ warnings: string[] }>`.
- Tests: Reset setzt Stufen zurück (gemergter Intent auf `showcase` ist danach weg), löscht Reste-Branches ohne PR,
  schließt offene PRs; Start ohne `resetRepo` lässt `showcase` unverändert; Fehler bei `resetBaseBranch` → Warnung,
  App läuft; `prepareBaseBranch` wird bei jedem Start mit Token aufgerufen.

## Task 4: Web und Doku

**Files:** `apps/web/instrumentation.ts`, `apps/web/app/actions.ts` (+Test), `apps/web/components/ResetButton.tsx`,
`apps/web/components/Sidebar.tsx`, `README.md`, `CLAUDE.md`

- `instrumentation.ts`: `engine.startup({ resetRepo: process.env.RESET_ON_START === 'true' })`.
- `resetSystemAction` gibt `{ warnings }` zurück; `ResetButton` zeigt Warnungen unter dem Button (role="status"),
  Bestätigungstext: „Datenbank leeren, Tickets neu einlesen, offene PRs der App schließen und den Branch showcase auf
  showcase-base zurücksetzen?“
- Sidebar: unter dem Repo `Branch: showcase` (aus `settings.baseBranch`).
- README: Abschnitt „Showcase-Branch und Repo-Reset“ (Branch, Tag, automatisches Anlegen, PRs gegen `showcase`,
  `master` unberührt, `RESET_ON_START`, Branch-Schutz auf `showcase` verhindert den Reset). „Verhalten beim Start“ und
  „Ablauf“ anpassen (`master` → `showcase`), Variable in die Tabelle. CLAUDE.md: Startup-Abschnitt und Env-Tabelle.

## Abnahme

- `npm test`, `npm run build`, `npm run lint` grün.
- Manuell (mit Token, Nutzer hat zugestimmt): Neustart legt Tag `showcase-base` und Branch `showcase` an; PR #1 (gegen
  `master`) wird geschlossen; CB-2 → PR gegen `showcase`; Reset-Button setzt `showcase` zurück, `master` unverändert.
