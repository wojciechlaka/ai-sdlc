# UI/UX-Konzept

Stand: die gebaute Oberfläche für Stufe 1 (Plan). Komponenten in `apps/web/components/`, Texte auf Deutsch.
Architektur: [architecture.md](architecture.md) · Zustände: [datenmodell.md](datenmodell.md)

## 1. Prinzipien

- **Eine Aktion pro Zustand.** Die Ticketseite zeigt immer genau den nächsten Schritt: starten, stoppen,
  antworten oder den PR öffnen. Was im Zustand nicht geht, erscheint nicht.
- **Der Merge auf GitHub ist das Gate.** Die App hat keinen eigenen Freigabe-Knopf. Geprüft und freigegeben
  wird im PR; die App erkennt den Merge (jede Minute und beim Öffnen der Ticketseite) und schiebt das Ticket
  weiter.
- **Inhalte live aus Git.** Der Inhalt einer abgeschlossenen Stufe wird beim Anzeigen von `showcase` gelesen,
  nicht aus der Datenbank. Was im Repo steht, zeigt die App.
- **Nachvollziehbar.** Jeder Lauf, jede Rückfrage, jeder PR und jeder Übergang steht im Log des Tickets, mit
  Kosten und Tokens.
- **Live, ohne Neuladen.** Fortschritt und Zustandswechsel kommen per SSE; die Seite aktualisiert sich selbst.

## 2. Board

Startseite `/`: über den Spalten die Zeile „Agent-Kosten gesamt: $0.42“ (Summe aller Tickets, `—` solange kein
Agent gelaufen ist), darunter drei Spalten nach Stufe mit Anzahl. Eine Karte zeigt Schlüssel, Priorität, Titel und —
bis das Ticket fertig ist — den Zustand als Badge (`bereit`, `Agent läuft`, `Rückfrage`, `in Review: PR #n`,
`fehlgeschlagen`); hat das Ticket schon Kosten, stehen sie klein und grau rechts neben dem Badge (z. B. `$0.09`) —
eine Zahl ohne Aufschlüsselung, damit die Karte ruhig bleibt; Details stehen auf der Ticketseite. Ein Klick öffnet
die Ticketseite. Leere Spalten zeigen „Keine Tickets“.

```text
+--------------------------------------------------------------------------------------------------+
| BOARD            | Agent-Kosten gesamt: $0.42                                                    |
|                  | +-----------------------+ +-----------------------+ +-----------------------+ |
|------------------| | 1 Plan              2 | | 2 Design            1 | | Fertig              0 | |
| Ziel-Repository  | | +-------------------+ | | +-------------------+ | | Keine Tickets         | |
| wojciechlaka/    | | | CB-1       Mittel | | | | CB-2         Hoch | | |                       | |
| node-express-    | | | Artikel als       | | | | Lesezeit bei      | | |                       | |
| realworld-       | | | Entwurf speichern | | | | Artikeln anzeigen | | |                       | |
| example-app      | | | bereit            | | | | bereit            | | |                       | |
| Branch: showcase | | +-------------------+ | | +-------------------+ | |                       | |
|                  | | +-------------------+ | |                       | |                       | |
| Reset            | | | CB-3         Hoch | | |                       | |                       | |
|                  | | | Unangemessene     | | |                       | |                       | |
|                  | | | Kommentare melden | | |                       | |                       | |
|                  | | | in Review: PR #7  | | |                       | |                       | |
|                  | | +-------------------+ | |                       | |                       | |
|                  | |                       | |                       | |                       | |
|                  | +-----------------------+ +-----------------------+ +-----------------------+ |
|                  |                                                                               |
+--------------------------------------------------------------------------------------------------+
```

## 3. Ticketseite

`/tickets/CB-2`: Kopf, Aktionsbereich, Ticket-Quelle, Stufen, Log.

```text
+------------------------------------------------------------------------------+
| CB-2 . Prioritaet Hoch                                                       |
| Lesezeit bei Artikeln anzeigen                                               |
| [2 Design] [bereit]                                                          |
|                                                                              |
| <Aktionsbereich, je nach Zustand - siehe unten>                              |
|                                                                              |
| Ticket                                                                       |
| Quelle: examples/tickets/cb-2-lesezeit.md                                    |
| Leser wollen vorher wissen, wie lange ein Artikel dauert ...                 |
| ---------------------------------------------------------------------------- |
| Stufen                                                                       |
| +--------------------------------------------------------------------------+ |
| | [x] 1 Plan . Intent   gemergt am 28.10.2026                              | |
| | docs/work/CB-2/intent.md (Link)   PR #5 (gemergt)                        | |
| | > Inhalt anzeigen   (aufklappbar, Markdown live von showcase)            | |
| +--------------------------------------------------------------------------+ |
| +--------------------------------------------------------------------------+ |
| | [ ] 2 Design . Spec                                                      | |
| | docs/work/CB-2/spec.md                                                   | |
| +--------------------------------------------------------------------------+ |
| +--------------------------------------------------------------------------+ |
| | Kosten                                                                   | |
| | 1 Plan . Intent: $0.15 . 2 Laeufe . 41.2K/2.1K                           | |
| | 2 Design . Spec: -                                                       | |
| | Gesamt: $0.15 (2 Laeufe)                                                 | |
| +--------------------------------------------------------------------------+ |
| ---------------------------------------------------------------------------- |
| Log                                                                          |
| 28.10.26, 10:02:11  System  Ticket uebernommen aus examples/tickets/...      |
| 28.10.26, 10:05:40  System  Agent gestartet (1 Plan, Sonnet 4.6)             |
| 28.10.26, 10:07:02  Agent   Agent fertig in 1m 22s . 41.2K/2.1K . $0.15      |
| 28.10.26, 10:07:05  System  PR #5 geoeffnet (CB-2/intent)                    |
| 28.10.26, 10:12:30  Mensch  PR #5 gemergt                                    |
| 28.10.26, 10:12:30  System  Stufe 1 Plan -> 2 Design                         |
+------------------------------------------------------------------------------+
```

- **Kopf:** Schlüssel, Priorität, Titel, Badge der Stufe (`1 Plan`, `2 Design`, `Fertig`) und des Zustands.
- **Ticket:** Pfad der Quelldatei und der Text als Markdown.
- **Stufen:** je Stufe ein Panel mit ✓ (abgeschlossen) oder ○, Merge-Datum, Link auf die Datei auf
  `showcase` (erst nach dem Merge), Link auf den PR mit Status (`offen`, `gemergt`, `geschlossen`) und dem
  aufklappbaren Inhalt „Inhalt anzeigen“. Darunter der Block **Kosten**: je Stufe Kosten, Anzahl Läufe und Tokens
  (`1 Plan · Intent: $0.09 · 3 Läufe · 12.3K↑ 1.2K↓`; `—` ohne Lauf) und fett die Summe
  (`Gesamt: $0.11 (4 Läufe)`). Gezählt werden die von der CLI gemeldeten Kosten aller beendeten Läufe der Stufe,
  auch verworfener; Läufe ohne Ergebnis zählen mit $0. Der gemeinsame Codebase-Summary-Lauf gehört keinem Ticket
  und fehlt hier.
- **Log:** Zeit, Akteur (`Mensch`, `Agent`, `System`) und eine Zeile pro Eintrag; Agent-Läufe mit Dauer,
  Tokens und Kosten. Vom Guard blockierte Werkzeugaufrufe stehen rot hervorgehoben als eigene Zeile
  („Blockiert: Bash \`rm -rf docs\` — Begründung“). Aufeinanderfolgende ausgeführte Werkzeugaufrufe werden zu
  einer Zeile „N Werkzeugaufrufe“ zusammengefasst, die sich aufklappen lässt (`<details>`, ohne Client-Zustand;
  z. B. „Bash \`git log -5\`“, „Read src/app.ts“).

**Aktionsbereich je Zustand:**

```text
ready / failed, Stufe 1  [Sonnet 4.6 v] [Plan starten]
                         failed: "Letzter Versuch fehlgeschlagen - Details im Log."
                         ohne Token: Knopf aus, Hinweis "GITHUB_TOKEN fehlt ..."
running                  Karte "Agent laeuft  0m 42s" mit Fortschrittszeilen
                         [Stoppen]
awaiting_answer          Karte "Frage vom Agent": Frage, Textfeld, [Antworten]
                         [Abbrechen]
in_review                [PR #7 oeffnen]
                         "Merge auf GitHub = Freigabe dieser Stufe. ..."
ready, Stufe 2           [Design starten] (deaktiviert)
                         "Der Design-Agent (Stufe 2) folgt im naechsten Schritt."
Fertig                   "Alle Stufen abgeschlossen."
```

Während die App den Zustand abgleicht (z. B. `in_review` ohne offenen PR), steht dort „Zustand wird
abgeglichen …“. Fehler einer Aktion erscheinen als rote Meldung darunter.

## 4. Seitenleiste

- **Board** — Link zur Startseite.
- **Ziel-Repository** — aus `TARGET_REPO`, nur lesend, mit Link auf GitHub; darunter **Branch: showcase**.
- **Token-Hinweis** — ohne `GITHUB_TOKEN`: „Token fehlt — GITHUB_TOKEN in apps/web/.env.local setzen (siehe
  README).“
- **Reset** — fragt vorher nach („Datenbank leeren, Tickets neu einlesen, offene PRs der App schließen und den
  Branch showcase auf showcase-base zurücksetzen?“), zeigt währenddessen „Setze zurück...“ und danach
  Warnungen des Starts (z. B. Branch-Schutz auf `showcase`) unter dem Knopf.

## 5. Live-Updates

- **Ticketseite:** abonniert `/api/events?ticketKey=CB-2`. `progress` erscheint sofort in der Karte „Agent
  läuft“; `state` und `question` laden die Seite neu (`router.refresh()`).
- **Board:** abonniert `/api/events` für alle Tickets und lädt bei jedem `state`-Event neu.
- **Verbindung:** Bricht die SSE-Verbindung während eines Laufs ab, zeigt die Karte „⚠ Verbindung
  unterbrochen“; nach dem Wiederverbinden lädt die Seite den aktuellen Stand.

## 6. Bewusst nicht gebaut

- Kein Freigabe- oder Ablehnen-Knopf in der App — das ist der PR auf GitHub.
- Kein Bearbeiten von Artefakten in der App — Änderungen gehen per Commit in den PR.
- Keine Tickets anlegen in der App — neue Tickets sind Dateien in `examples/tickets/`.
