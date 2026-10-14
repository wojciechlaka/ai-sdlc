# Refinement Engine — Backend

Node.js/Hono server that orchestrates Claude AI to analyze tickets and produce implementation plans.

## What it does

1. Persists tickets and agent run history in a local SQLite database (Drizzle ORM)
2. Accepts REST requests to create, read, and manage tickets
3. Clones or pulls the target repository into a local cache before each run (auto-recovers from corruption)
4. Generates a Claude-powered codebase summary once per git commit and model, and reuses it across runs
5. Spawns a Claude CLI process (`claude --print`) for each refinement run, with the summary prepended to the prompt
6. Supports an async question/answer loop: when the agent needs clarification it emits a `question` event and waits for a `POST /tickets/:id/answer`
7. Pushes live progress, questions, and status updates to the browser over SSE (`GET /events`)

## Architecture

```
HTTP :3000  ─── REST API (Hono)          SQLite (data/refinement.db)
                    │                         │
                    ├── refinementOrchestrator ├── tickets
                    │         │               ├── agent_runs
                    │         └── repoCache   ├── audit_events
                    │               │         └── review_decisions
                    │               ├── git clone / pull  →  $REPO_CACHE_DIR/<url-hash>/
                    │               └── codebase summary  →  codebase-summary-<commit>-<model>.md
                    │
SSE      :3000/events ─── sseLayer ─── refinementEvents (EventEmitter)
```

## Prerequisites

- Node.js 20+
- `claude` CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- A `GITHUB_TOKEN` environment variable if the target repository is private

## Setup

```bash
npm install
```

Drizzle migrations run automatically on startup — no manual step needed.

## Running

```bash
# Development (ts-node, auto-reloads on file save)
npm run dev

# Production (compile first, then run)
npm run build
node dist/index.js
```

The server starts on port **3000**.

## Environment variables

| Variable                | Default                        | Description                                                  |
|-------------------------|--------------------------------|--------------------------------------------------------------|
| `GITHUB_TOKEN`          | —                              | Injected into clone URLs for private repositories            |
| `REPO_CACHE_DIR`        | `$TMPDIR/repo-cache`           | Directory where repositories are cloned/cached               |
| `DB_PATH`               | `data/refinement.db`           | Path to the SQLite database file                             |
| `REFINEMENT_TIMEOUT_MS` | `600000` (10 min)              | Max milliseconds a Claude CLI process may run before timeout |

## REST API

| Method   | Path                    | Description                                                                    |
|----------|-------------------------|--------------------------------------------------------------------------------|
| `GET`    | `/tickets`              | List all tickets                                                                |
| `GET`    | `/tickets/:id`          | Get a single ticket with its latest run                                        |
| `POST`   | `/tickets`              | Create a ticket (`title`, `description` required)                              |
| `DELETE` | `/tickets/:id`          | Delete a ticket (rejected if `refining`)                                       |
| `POST`   | `/tickets/:id/refine`   | Start a refinement run (`repo`, `model` required; rejected if not `backlog` or `review`) |
| `POST`   | `/tickets/:id/stop`     | Stop a running refinement                                                      |
| `POST`   | `/tickets/:id/answer`   | Submit an answer to the agent's pending question (rejected if not `refining`)  |
| `GET`    | `/runs/:id`             | Get a single agent run by ID                                                   |
| `POST`   | `/system/reset`         | Delete all tickets and recreate the three CC seed tickets (stops running runs) |

### Ticket status values

| Status    | Meaning                                              |
|-----------|------------------------------------------------------|
| `backlog` | Not yet refined — initial state after creation       |
| `refining`| Agent is currently running                           |
| `review`  | Agent completed and produced a refinement plan       |
| `failed`  | Last run ended in an error or timeout                |

### Ticket ID format

Tickets are identified by a `T-{n}` string in all API and SSE payloads (e.g. `T-1`, `T-42`).

## Server-Sent Events

Connect to `GET /events?ticketId=<id>` (`text/event-stream`) to receive events for a ticket.

| Event type | Payload                  | Meaning                                              |
|------------|--------------------------|------------------------------------------------------|
| `status`   | `{ status: string }`     | Ticket status changed                                |
| `progress` | `{ message: string }`    | Incremental log line from the Claude process         |
| `question` | `{ question: string }`   | Agent is waiting for a human answer                  |

## Agent output schema

The Claude agent returns one of two JSON shapes validated by `AgentOutputSchema` (Zod):

**Question** — agent needs clarification before it can produce a plan:
```json
{ "type": "question", "question": "..." }
```

**Refinement** — complete implementation plan:

| Field                | Type                                             | Description                                       |
|----------------------|--------------------------------------------------|---------------------------------------------------|
| `type`               | `"refinement"`                                   | Discriminant                                      |
| `result.title`       | `string` (max 60 chars)                          | Improved ticket title                             |
| `result.userStory`   | `string`                                         | "Als X möchte ich Y, damit Z."                   |
| `result.acceptanceCriteria` | `string[]`                              | Observable acceptance criteria                    |
| `result.affectedFiles` | `{ path, description }[]`                      | Files that will change and why                    |
| `result.risks`       | `{ description, severity: low\|medium\|high }[]` | Implementation risks with severity                |
| `result.openQuestions` | `{ question, blocksImplementation }[]`         | Open questions; flag indicates whether they block |
| `result.confidence`  | `integer` 0–100                                  | Agent's self-assessed analysis quality            |

If the output fails schema validation the orchestrator automatically retries once, injecting the failed output and error back into the prompt.

## Question/answer loop

When the agent emits a `question` event, the ticket remains in `refining` state. The frontend displays a `QuestionPanel` and the user submits an answer via `POST /tickets/:id/answer`. The orchestrator starts a new agent run with the full Q&A history included in the prompt. This continues until the agent produces a refinement plan.

## Codebase summary cache

Before each refinement run the orchestrator calls `ensureRepoSummary`. It checks for a file named `codebase-summary-<commit-hash>-<model>.md` in the repository's cache directory:

- **Cache hit** — the file is read and prepended to the refinement prompt. No extra Claude call.
- **Cache miss** — a Claude process explores the repository and writes a structured Markdown overview to that file. Subsequent runs on the same commit and model reuse it instantly.

Each model gets its own summary file. Files are eventually evicted by OS tmpdir cleanup. If generation fails, the refinement continues without it.

## Tests

```bash
npm test            # run once
npm run test:watch  # watch mode
```
