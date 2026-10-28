# Ticket-Eingang: Beispiel-Tickets für „Conduit“

Jede Markdown-Datei in diesem Ordner simuliert ein Jira-Ticket und ist die **einzige Quelle** für die Tickets
der App. Die Tickets sind bewusst roh und unterspezifiziert — so, wie ein Stakeholder sie ins Backlog wirft.
Der Intent-Agent macht daraus in Stufe 1 ein `intent.md` im Ziel-Repo
[wojciechlaka/node-express-realworld-example-app](https://github.com/wojciechlaka/node-express-realworld-example-app)
(Fork von [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app)).

Kontext zum Repo: Backend des Blogs „Conduit“ (Medium-Klon aus dem RealWorld-Projekt) — TypeScript, Express,
Prisma; REST-API für Artikel, Kommentare, Tags, Favoriten, Follow und Auth.

| Ticket | Zweck in der Demo |
|---|---|
| CB-1 Entwürfe | mittel, mehrere Schichten (Modell, API, Feed, Rechte) — echte Rückfragen |
| CB-2 Lesezeit | klein — schneller, günstiger Lauf |
| CB-3 Kommentare melden | fachlich unklar (wer moderiert? was passiert danach?) — Agent muss Regeln erfragen |

## Neues Ticket anlegen

1. Datei `cb-<nummer>-<kurzname>.md` in diesem Ordner anlegen, z. B. `cb-4-tags-umbenennen.md`.
2. Format:

   ```markdown
   # CB-4: Tags umbenennen

   Freier Text: Was soll sich ändern, für wen, warum? Gern roh und unvollständig.

   **Priorität:** Niedrig
   ```

   - **Erste Zeile** ist Pflicht: `# <SCHLÜSSEL>: <Titel>`. Der Schlüssel besteht aus einem Präfix
     (Großbuchstabe, danach Großbuchstaben oder Ziffern), Bindestrich und Nummer (`CB-4`, `B2B-7`) und muss
     eindeutig sein. Er bestimmt Branch (`CB-4/intent`) und Ablage (`docs/work/CB-4/intent.md`).
   - Der Text darunter wird die Beschreibung.
   - Die Zeile `**Priorität:** …` ist optional.
3. App neu starten oder **Reset** klicken — **das neue Ticket erscheint in Stufe 1 Plan.**

Dateien ohne passende erste Zeile werden mit einer Warnung im Server-Log übersprungen (diese README still).
Geänderter Text eines bestehenden Tickets wird beim nächsten Start übernommen; Stufe und Zustand bleiben.
Löscht man eine Datei, bleibt das Ticket bis zum nächsten Reset in der App.
