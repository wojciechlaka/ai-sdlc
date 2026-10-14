# Refinement Engine — Frontend

React + TypeScript single-page application for managing refinement tickets and interacting with the Claude AI agent.

## What it does

- Lists tickets in a sidebar and shows full detail in the main panel
- Lets you create tickets, pick a Claude model, and start/stop refinement runs
- Streams live progress logs and agent questions over SSE
- Displays the generated implementation plan as formatted Markdown
- Shows run metadata: duration, token usage, estimated cost, and analysis quality
- Supports an async question/answer loop when the agent needs clarification

## Tech stack

- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **shadcn/ui** component primitives
- **react-markdown** for rendering implementation plans
- **Vite** for development and bundling
- **Vitest** + Testing Library for tests

## Prerequisites

- Node.js 20+
- Backend running on `localhost:3000` (see `../backend/README.md`)

## Setup

```bash
npm install
```

## Running

```bash
npm run dev
```

Opens at **http://localhost:5173**. API calls and SSE connections are proxied to `localhost:3000` automatically.

## Proxy

Vite forwards the following paths to the backend:

| Path       | Target                        |
|------------|-------------------------------|
| `/tickets` | `http://localhost:3000`       |
| `/system`  | `http://localhost:3000`       |
| `/events`  | `http://localhost:3000` (SSE) |

## Available scripts

| Script                  | Description                                      |
|-------------------------|--------------------------------------------------|
| `npm run dev`           | Start Vite dev server with HMR                   |
| `npm run build`         | Type-check and build for production              |
| `npm run lint`          | Run ESLint                                       |
| `npm run format`        | Format all files in `src/` with Prettier         |
| `npm run format:check`  | Check formatting without writing (useful in CI)  |

## Code style

The project uses **ESLint** and **Prettier** together.

- ESLint handles code correctness (React hooks rules, TypeScript, unused vars).
- Prettier handles formatting (quotes, semicolons, trailing commas, line width).
- `eslint-config-prettier` disables any ESLint rules that would conflict with Prettier.

Prettier config (`.prettierrc`):

```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Format before committing:

```bash
npm run format
npm run lint
```

## Project structure

```
src/
├── api/
│   └── ticketApi.ts        API client — all fetch calls to the backend
├── components/
│   ├── CreateTicketDialog  Dialog for creating a new ticket (title, description)
│   ├── ModelSelect         Claude model dropdown (sm / md variants)
│   ├── QuestionPanel       Amber card shown when the agent asks a question
│   ├── TicketDetail        Main detail view for a single ticket
│   ├── TicketList          Sidebar list of all tickets
│   └── ui/                 shadcn/ui primitives (badge, button, card, …)
├── hooks/
│   └── useSSE.ts           SSE hook — streams events for a ticket
├── lib/
│   └── utils.ts            Tailwind class merging utility
└── App.tsx                 Root layout (sidebar + detail panel)
```

## Key behaviors

**Ticket detail layout** — The description field always shows the original ticket description. The agent's output (user story, acceptance criteria, affected files, risks, blocking questions) is shown separately in the collapsible Agent-Run section below.

**Metadata row** — After a refinement run the following are shown below the model selector:

| Label           | Content                                                                           |
|-----------------|-----------------------------------------------------------------------------------|
| Modell          | Claude model used (editable while `backlog` or `review`)                          |
| Dauer           | Wall-clock time of the last run                                                   |
| Tokenverbrauch  | `(inputTokens + cacheCreationTokens)↑ outputTokens↓` — large on cache miss, small on cache hit |
| Kosten          | Estimated cost (from CLI or model pricing table)                                  |
| Analysequalität | Agent's self-assessed confidence (0–100 %)                                        |

**Model selection** — The model can be changed while the ticket is `backlog` or `review` and is locked during a run. Changing the model triggers a fresh codebase analysis on the next run (summaries are cached per model).

**Reset** — A Reset button next to "Neues Ticket" deletes all tickets, stops any running refinements, and recreates the three CC seed tickets in `backlog` state.

**Progress streaming** — The backend emits human-readable phase messages over SSE (`GET /events`) as Claude works. The frontend accumulates these in a log panel that persists even if you navigate away and back to the ticket.

**Question/answer flow** — When the agent needs clarification it emits a `question` SSE event and the ticket stays in `refining` state. The frontend shows a `QuestionPanel` with the question text. Submitting an answer posts it to `POST /tickets/:id/answer`, which starts a new agent run with the full Q&A history included in the prompt. This repeats until the agent produces a refinement plan.

**Elapsed timer** — A seconds counter runs while the agent is active. It pauses while a question is pending (the agent is idle, waiting for input) and resets when refinement finishes.
