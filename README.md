# Refinement Engine

AI-gestützte Ticket-Verfeinerung: Ein Agent analysiert Tickets gegen die Codebase, stellt Rückfragen und liefert strukturierte Refinement-Ergebnisse.

## Starten

```bash
npm install
npm run dev
```

Startet Backend und Frontend parallel. Das Frontend wartet automatisch bis das Backend bereit ist, bevor es hochfährt. Beim ersten Start mit leerer Datenbank werden drei Beispiel-Tickets eingefügt.

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:3000      |

## Struktur

```
apps/
  backend/   # Hono API, SQLite, Claude CLI-Integration
  frontend/  # React + Vite
packages/
  shared/    # Gemeinsame Typen und Schemas (Zod)
```

Details zu den einzelnen Apps: [`apps/backend/README.md`](apps/backend/README.md) und [`apps/frontend/README.md`](apps/frontend/README.md).

## Voraussetzungen

- Node.js 20+
- `claude` CLI installiert und eingeloggt (`claude login`)
