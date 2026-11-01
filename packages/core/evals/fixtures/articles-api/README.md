# Articles API

Kleine Blog-API: Artikel anlegen, auflisten, lesen und löschen. Express, Daten im Speicher.

- `GET /api/articles` — alle Artikel, neueste zuerst
- `GET /api/articles/:slug` — ein Artikel
- `POST /api/articles` — Artikel anlegen (`title`, `body`, `author`)
- `DELETE /api/articles/:slug` — Artikel löschen

Aufbau: `src/routes` (HTTP), `src/services` (Fachlogik), `src/store` (Speicher). Tests mit `node --test`.
