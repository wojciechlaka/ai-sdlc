# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm install          # install all workspace dependencies
npm run dev          # start backend (:3000) and frontend (:5173) concurrently
```

### Testing
```bash
npm run test                          # run all workspace tests once
npm test -w apps/backend              # backend tests only
npm run test:watch -w apps/backend    # backend watch mode
npm test -w apps/frontend             # frontend tests only
npm test -w packages/shared           # shared package tests only

# Run a single test file or pattern
npm test -w apps/backend -- path/to/test.ts
```

### Building & Linting
```bash
npm run build                     # build all workspaces
npm run lint -w apps/frontend     # ESLint
npm run format -w apps/frontend   # Prettier
```

### Database
```bash
# Run from apps/backend — migrations apply automatically on startup
npx drizzle-kit generate   # generate migration after schema changes
npx drizzle-kit studio     # browse the SQLite database in-browser
```

## Architecture

This is a **Refinement Engine** — an AI-powered tool that analyzes tickets against a codebase and produces structured implementation plans. It uses a monorepo with npm workspaces.

```
apps/backend/    Hono REST API on :3000, SQLite (Drizzle ORM), Claude CLI orchestration
apps/frontend/   React 19 + Vite on :5173; proxies /tickets, /system, /events → :3000
packages/shared/ Shared Zod schemas for agent output (the only cross-package contract)
```

### Request flow

1. `POST /tickets/:id/refine` → `refinementOrchestrator.startRefinement`
2. `repoCache.ensureRepo` clones/pulls the target git repo into `$REPO_CACHE_DIR/<url-hash>/`
3. `repoCache.ensureRepoSummary` checks for a cached `codebase-summary-<commit>-<model>.md`; generates one via Claude CLI if absent
4. `agentCli.runRefinement` spawns `claude --print --output-format stream-json` with the prompt piped to stdin
5. Agent returns either `{ type: "question" }` (Q&A loop: user answers via `POST /tickets/:id/answer`) or `{ type: "refinement", result: ... }` (done)
6. If schema validation fails, one automatic retry is made with the malformed output injected back into the prompt
7. All progress, status, and question events stream to the frontend via SSE (`GET /events?ticketId=<id>`)

### Key modules

- `src/agentCli/` — spawns the Claude CLI subprocess, parses stream-JSON stdout, validates output against `AgentOutputSchema`, handles retry logic
- `src/agentCli/prompt.ts` — builds the prompt from the skill file + ticket + codebase summary + Q&A history
- `src/refinementOrchestrator.ts` — orchestrates repo prep → summary → agent → status transitions; fire-and-forget; all errors handled internally
- `src/repoCache.ts` — git clone/pull cache; codebase summary generation and caching
- `src/db/schema.ts` — Drizzle schema: `tickets`, `agent_runs`, `audit_events`, `review_decisions`
- `src/restApi.ts` — all REST routes; thin layer over db helpers + orchestrator calls
- `src/sseLayer.ts` — one SSE connection per ticket; wired to `refinementEvents` EventEmitter
- `apps/backend/skills/refinement-agent.md` — the skill file included verbatim in every agent prompt

### Ticket status lifecycle

`backlog` → `refining` → `review` (success) or `failed` (error/timeout)  
Stopping a run reverts `refining` → `backlog`.

### Adding things

- **New API endpoint**: `apps/backend/src/restApi.ts`
- **New DB table or column**: update `apps/backend/src/db/schema.ts`, run `npx drizzle-kit generate` from `apps/backend/`, add accessor helpers in `apps/backend/src/db/`
- **New agent output field**: update `packages/shared/src/refinementSchema.ts` (Zod) and the skill file at `apps/backend/skills/refinement-agent.md`
- **New frontend component**: `apps/frontend/src/components/`; UI primitives live in `src/components/ui/` (shadcn-based)

## Prerequisites & Environment

- Node.js 20+
- `claude` CLI installed and authenticated: `npm install -g @anthropic-ai/claude-code && claude login`

| Variable                | Default                   | Purpose                                              |
|-------------------------|---------------------------|------------------------------------------------------|
| `GITHUB_TOKEN`          | —                         | Injected into clone URLs for private repositories    |
| `REPO_CACHE_DIR`        | `$TMPDIR/repo-cache`      | Where repos are cloned                               |
| `DB_PATH`               | `data/refinement.db`      | SQLite file path (relative to `apps/backend/`)       |
| `REFINEMENT_TIMEOUT_MS` | `600000` (10 min)         | Max Claude subprocess runtime                        |
