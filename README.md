# Refinement Engine

AI-gestützte Ticket-Verfeinerung: Ein Agent analysiert Tickets gegen die Codebase, stellt Rückfragen und liefert strukturierte Refinement-Ergebnisse.

## Starten

```bash
npm install
npm run dev
```

Startet die Next.js-App unter http://localhost:3000. Beim ersten Start mit leerer Datenbank werden drei Beispiel-Tickets eingefügt.

## Ausprobieren

1. App starten (`npm run dev`) und http://localhost:3000 öffnen.
2. In der linken Spalte unter **Repository** eintragen:
   ```
   https://github.com/wojciechlaka/node-express-realworld-example-app
   ```
   (eigener Fork der Blog-API „Conduit“, siehe [`examples/tickets/`](examples/tickets/README.md))
3. Ein Beispiel-Ticket öffnen (CB-2 ist der schnellste Lauf) und **Refine** klicken.

Ein Lauf nutzt den eigenen Claude-Login und verbraucht Tokens. Eine bestehende lokale Datenbank
zeigt die neuen Beispiel-Tickets erst nach **Reset**.

## Struktur

```
apps/
  web/            # Next.js (App Router): UI, Server Actions, SSE-Route – der einzige Prozess
packages/
  core/           # Fachkern nach Ports & Adapters (Domäne, Use Cases, Adapter für SQLite, Git, Claude CLI, Events)
  shared/         # Zod-Verträge zwischen Kern und UI (DTOs, Inputs, Events, Agent-Ausgabe)
```

Abhängigkeitsrichtung: `web → core → shared`. Domäne und Use Cases importieren keine Adapter; das prüft `npm run lint`.

## Voraussetzungen

- Node.js 20+
- `claude` CLI eingeloggt (`claude login`); das Binary kommt über `@anthropic-ai/claude-code` als Abhängigkeit von `packages/core`

## Befehle

| Befehl          | Zweck                                   |
|-----------------|-----------------------------------------|
| `npm run dev`   | Entwicklungsserver (http://localhost:3000) |
| `npm run build` | Typprüfung aller Pakete + `next build`  |
| `npm start`     | gebaute App starten                     |
| `npm test`      | alle Tests (Vitest)                     |
| `npm run lint`  | Abhängigkeitsregel des Hexagons         |

Die App läuft als ein dauerhafter Node-Prozess (lang laufende Agent-Prozesse, Event-Bus im Speicher, lokale SQLite). Serverless-Hosting wird nicht unterstützt (siehe [D19](docs/decisions.md)).
