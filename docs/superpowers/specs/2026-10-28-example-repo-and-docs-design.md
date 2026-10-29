# Design: Eigenes Beispiel-Repo + Doku auf Ist-Stand

Datum: 2026-10-28 · Status: abgestimmt, bereit für Implementierungsplan

## 1. Ziel

1. Die Refinement Engine bekommt als Ziel-Repo einen **eigenen Fork** einer kleinen, öffentlichen
   Beispiel-App statt `qvest-digital/coffee-chat`.
2. Die **Seed-Tickets** und Vorlagen beziehen sich auf diese App.
3. **Roadmap und Architektur-Doku** beschreiben den Ist-Stand nach D19 (Next.js + Hexagonal-Kern)
   und das neue Beispiel-Repo; die Architektur-Bilder werden neu gerendert.

## 2. Beispiel-Repo (erledigt)

- Fork: **https://github.com/wojciechlaka/node-express-realworld-example-app**
  (Quelle: `gothinkster/node-express-realworld-example-app`, öffentlich, Default-Branch `master`).
- Inhalt: Backend des Blogs „Conduit“ (Medium-Klon aus dem RealWorld-Projekt) – TypeScript, Express,
  Prisma; Artikel, Kommentare, Tags, Favoriten, Follow, Auth. Klein (~345 KB).
- Die Engine braucht nur Lesezugriff (Klonen ohne Token).

## 3. Seed-Tickets

Bewusst roh und unterspezifiziert (wie ein Stakeholder sie ins Backlog wirft), Präfix `CB-` (Conduit Blog):

| ID | Titel | Beschreibung | Priorität | Zweck in der Demo |
|---|---|---|---|---|
| CB-1 | Artikel als Entwurf speichern | Autoren wollen Artikel erst speichern und später veröffentlichen. Bis dahin soll sie niemand sonst sehen. Im Feed sollen Entwürfe natürlich nicht auftauchen. | Hoch | mittel, mehrere Schichten, echte Rückfragen |
| CB-2 | Lesezeit bei Artikeln anzeigen | Leser möchten vorher sehen, wie lange ein Artikel ungefähr dauert. Die Angabe sollte in der API mitkommen, damit das Frontend sie anzeigen kann. | Mittel | klein, schneller/günstiger Lauf |
| CB-3 | Unangemessene Kommentare melden | Unter manchen Artikeln landen Spam oder beleidigende Kommentare. Leser sollen solche Kommentare melden können, und irgendwer muss sich dann darum kümmern. | Hoch | fachlich unklar, Agent muss Regeln erfragen |

Umsetzung:
- `packages/core/src/domain/seeds.ts`: `SEED_TICKETS` = die drei Tickets (Titel + Beschreibung).
- Tests, die Seed-Titel prüfen, anpassen (Startup-Test prüft nur die Anzahl).
- `examples/tickets/`: `cc-*.md` → `cb-1-entwuerfe.md`, `cb-2-lesezeit.md`, `cb-3-kommentare-melden.md`
  (Format wie bisher: `# ID: Titel`, Text, `**Priorität:** …`); `README.md` beschreibt Fork und Repo-Kontext.
- Bestehende lokale Datenbanken behalten alte Tickets bis „Reset“ (keine Migration).

## 4. README der Engine

Abschnitt „Ausprobieren“: App starten, als Repository
`https://github.com/wojciechlaka/node-express-realworld-example-app` eintragen, Ticket öffnen, „Refine“.
Hinweis: verbraucht Tokens über den eigenen Claude-Login.

## 5. Doku auf Ist-Stand

### `docs/feature-roadmap.md`
- Erster echter Use Case: der Fork (Conduit-Blog); coffee-chat in einem Satz als frühere Wahl.
- Stack-Abschnitt Phase 2: Next.js 16 (App Router, ein Prozess) + `packages/core` (Ports & Adapters)
  + `packages/shared` (Zod) + SQLite/Drizzle; Verweis auf D19.

### `docs/architecture.md`
- **§6 (Phase 2, Ist-Bau-Stand) neu:** eine Next.js-App als Prozess; Hexagon (domain / application /
  ports / adapters); Request- und SSE-Fluss; Liste der Ports und Adapter; Grenzen (kein Serverless).
  Der vorläufige D19-Hinweis entfällt.
- **§4 Topologie-Tabelle/Skizze und §5.1 Phase-3-Deployment-Skizze:** „Frontend (Vite/React)“ +
  „Backend (Hono)“ → „App (Next.js + Kern)“; Phase-3-Aussagen (lokale App pro Nutzer, geteilte
  Postgres, secret-frei) bleiben inhaltlich unverändert.
- **§5.5 / §8:** Hinweis, dass Integrationen als Adapter hinter Ports im Kern landen und die
  Persistenz in Phase 3 ein weiterer Adapter (Postgres) ist, Events prozessübergreifend über einen
  neuen `EventPublisher`-Adapter (z. B. `LISTEN/NOTIFY`).
- Diagramme in `architecture.md` bleiben **ASCII** (D18).

### Diagramme
- `docs/architecture.mmd` neu: Browser → Next.js (RSC, Server Actions, `/api/events`) →
  `packages/core` (Use Cases, Ports) → Adapter (SQLite/Drizzle, Git-Repo-Cache, Claude CLI,
  Node-Event-Bus) → externe Systeme (Dateisystem/DB, GitHub, Claude).
- `docs/architecture-annotated.html`: Texte auf Ist-Stand (Port 3000, Next.js, Kern, Adapter).
- **PNG neu rendern:** `architecture.png` aus `.mmd` via `npx @mermaid-js/mermaid-cli`;
  `architecture-annotated.png` via headless Chrome bzw. `docs/screenshot.mjs`.

Nicht im Umfang: `datenmodell.md` (stimmt), `ui-ux-concept.md`, Inhalte zu Phase 4/5, Historie in
`decisions.md` (D1–D18 bleiben, nur D19 beschreibt den neuen Stand).

## 6. Abnahme

- `npm test`, `npm run build`, `npm run lint` grün.
- Frische DB (bzw. „Reset“) zeigt CB-1…CB-3.
- `grep -ri "coffee" docs README.md CLAUDE.md examples --exclude-dir=superpowers` liefert nur Historien-Sätze:
  Roadmap, `decisions.md` (D8) und `examples/tickets/README.md`.
- `grep -rwiE "vite|hono|5173" docs --exclude-dir=superpowers` (Wortsuche, damit „Vitest“ nicht zählt) liefert nur Treffer in `decisions.md`
  (Historie D2/D19).
- Beide PNGs sind neu erzeugt und zeigen den Ist-Stand (visuell geprüft).
