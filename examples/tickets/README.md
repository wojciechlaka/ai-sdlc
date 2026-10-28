# Seed-Tickets für das Beispiel-Repo „Conduit“

Diese Tickets sind bewusst roh und unterspezifiziert formuliert — so, wie sie ein Stakeholder
ins Backlog werfen würde. Sie sind der Input für den Refinement Agent, der sie gegen das Repo
[wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)
schärft (Fork von [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app)).
Eine Datei pro Ticket; die Dateien simulieren Jira-Tickets und sind die Vorlage für den Ticket-Eingang.

Die App-Seeds in `packages/core/src/domain/seeds.ts` spiegeln diese Dateien derzeit von Hand; das Einlesen
der Dateien folgt mit dem Umbau auf das Arbeitsmodell.

Kontext zum Repo: Backend des Blogs „Conduit“ (Medium-Klon aus dem RealWorld-Projekt) —
TypeScript, Express, Prisma; REST-API für Artikel, Kommentare, Tags, Favoriten, Follow und Auth.

| Ticket | Zweck in der Demo |
|---|---|
| CB-1 Entwürfe | mittel, mehrere Schichten (Modell, API, Feed, Rechte) — echte Rückfragen |
| CB-2 Lesezeit | klein — schneller, günstiger Lauf |
| CB-3 Kommentare melden | fachlich unklar (wer moderiert? was passiert danach?) — Agent muss Regeln erfragen |

Bis zum Wechsel auf dieses Repo zielten die Seeds auf [qvest-digital/coffee-chat](https://github.com/qvest-digital/coffee-chat).
