# Design: Doku neu ausrichten am AI-Native SDLC Playbook

Datum: 2026-10-28 · Status: abgestimmt, bereit für Implementierungsplan

## 1. Ziel

Die Projekt-Doku folgt künftig dem **AI-Native SDLC Playbook** von Anthropic. Die bisherigen Entscheidungen
und die Phasen-Roadmap (Phase 2–5, geteilte DB, Enterprise) sind **verworfen** und werden nicht als Historie
gepflegt (Git-Historie genügt). Es gibt nur noch: die lokale App heute und die sechs Playbook-Stufen.

Nur Doku — keine Codeänderung. Der Umbau der App auf Intent/Spec in Git ist ein eigenes, folgendes Spec.

## 2. Inhaltliche Leitlinien (abgestimmt)

**Playbook-Kern.** Sechs Stufen als Kreislauf: Plan → Design → Build → Test → Deploy → Maintain. Jede Stufe
erzeugt ein Artefakt, das Mensch und Agent lesen und das die nächste Stufe speist:
`intent.md` → `spec.md` → `plan.md` → Code-PR → Produktion → (Befund) neues `intent.md`.
Menschen geben an Gates frei; Governance als Code (Skills, Hooks, Evals); eine Metrik pro Stufe.

**Arbeitsmodell der Plattform.**
- **Inhalte in Git:** Artefakte pro Ticket als Markdown im Ziel-Repo, z. B. `docs/work/<TICKET>/intent.md`.
- **Branch + PR pro Stufe:** Branch `<TICKET>/<stufe>` (z. B. `CB-3/intent`, `CB-3/spec`); der PR ist das Gate;
  **Merge = Übergang** in die nächste Stufe.
- **Zustand in der Plattform-DB:** aktuelle Stufe pro Ticket + persistentes Log pro Ticket (Läufe,
  Rückfragen, Freigaben, Übergänge, Zeitstempel). Die Plattform erkennt Merges durch Abfrage der
  Git-Host-API (eine lokale App empfängt keine Webhooks).
- **Ticket-Eingang:** Jira o. Ä. liefert nur den rohen Ticket-Inhalt. Im Showcase simulieren Markdown-Dateien
  (`examples/tickets/*.md`) die Jira-Tickets. **Kein Spiegel** von Inhalten nach Jira (keine doppelte
  Datenhaltung). Später optional: Statuswechsel nach Jira; Branch-Namen mit Ticket-Schlüssel verknüpfen sich
  über die Git-Integration von Jira automatisch.
- **Showcase-Umfang:** Stufe 1 (Plan → `intent.md`) und Stufe 2 (Design → `spec.md`). Stufen 3–6 nur als Ausblick.

**Neues Entscheidungslog (E1–E5), ohne Verweise auf frühere Entscheidungen:**

| Nr. | Entscheidung | Kern-Begründung |
|---|---|---|
| E1 | Arbeitsmodell nach AI-Native SDLC Playbook (Inhalte in Git, Zustand + Log in DB, Branch+PR pro Stufe, Merge = Übergang, Jira nur Eingang, Showcase Stufe 1+2) | Code ist nicht mehr der Engpass; Planung/Review brauchen nachvollziehbare Artefakte und klare Gates; eine Quelle pro Information |
| E2 | Eine Next.js-App (App Router) als einziger Prozess; Fachkern `packages/core` nach Ports & Adapters; Zod-Verträge in `packages/shared`; kein Serverless | ein Prozess/ein Start-Befehl; schmale Fachlogik, wachsende Ränder (Git-Host, später Jira/CI/Monitoring) als Adapter; Dependency-Regel per ESLint; lang laufende Agent-Prozesse + In-Memory-Events + lokale SQLite |
| E3 | Coding-Agent als Headless-CLI (`claude --print`) hinter dem Port `AgentRunner`; kein eigener Orchestrator; Agent SDK als späterer Adapter | Agent-Schleife nicht nachbauen; Austausch bleibt lokal im Adapter |
| E4 | Credentials bleiben lokal beim Nutzer (Claude-Login, Git-Host-Token); Plattform hält keine Secrets | kein Secret-Management in der Plattform; Agent handelt im Namen des Nutzers |
| E5 | Skizzen in der Markdown-Doku als ASCII; gerenderte Bilder nur für die Übersichtsseite (`architecture.png`, `architecture-annotated.png`) | eine editorunabhängige Notation ohne Toolchain |

## 3. Änderungen je Datei

| Datei | Änderung |
|---|---|
| `docs/feature-roadmap.md` | **Neu geschrieben.** Gliederung: (0) kurzer Kopf mit Bezug aufs Playbook; (1) Ziel & Leitprinzipien (Real first; Inhalte in Git, Zustand in der Plattform; Mensch gibt an Gates frei; eine Metrik pro Stufe); (2) Produktthese (Plattform = Control Layer: Zustand, Gates, Agenten über die Stufen; Inhalte bleiben im Kunden-Repo); (3) Arbeitsmodell (ASCII-Skizze Ticket → Artefaktkette, Branch+PR pro Stufe, DB-Zustand, Jira-Rolle); (4) Sechs Stufen — je Ziel, Artefakt, Gate, Metrik, Status (1+2 Showcase, 3–6 Ausblick); (5) Integrationen je Stufe (Git-Host ab Stufe 1 Pflicht; Jira optional als Status-Adapter; CI ab Stufe 4; Monitoring/Alerts ab Stufe 6); (6) Stand heute & nächster Schritt (heute: Refinement mit Ergebnis in der DB; nächster Schritt: Umbau auf Intent/Spec in Git); (7) ein Satz „Später: Betrieb im Team und im Unternehmen“. Entfällt: Phasen 2–5, Feature-Priorisierung P0–P3, Packaging-Idee, alle D-Verweise. |
| `docs/decisions.md` | **Neu geschrieben** mit E1–E5 (Format: `## E<n> — Titel (Datum)`, Entscheidung, Begründung, bewusste Trade-offs). |
| `docs/architecture.md` | **Neu, deutlich kürzer:** (1) Überblick (Bild in wenigen Sätzen + Verweis auf `architecture.png`); (2) Prinzipien (aus E1–E5 abgeleitet, ohne Wiederholung der Begründungen); (3) Arbeitsmodell nach Playbook (ASCII: Stufenkreislauf mit Artefakten und Gates; Branch/PR/Merge; Zustand + Log in DB; Merge-Erkennung per Git-Host-API); (4) Ist-Architektur (heutige Abb. 6 und Texte zu Schichten, Refine-Fluss, Grenzen, Beispiel-Ziel — inhaltlich wie bisher, Verweise auf E2/E3 statt D-Nummern); (5) Was sich für den Showcase ändert (Git-Adapter schreibt Branch + Datei + PR; Stufe statt Status; Abfrage PR-Status; Log-Einträge pro Übergang — als Ausblick auf das Umbau-Spec, ohne Detaildesign); (6) Glossar (Intent, Spec, Plan, Stufe, Gate, Artefakt, Zustand, Port, Adapter). Entfällt: Vertrauensmodell, Topologie-Evolution, alle „Phase 3/4/5“-Abschnitte, Cheatsheet, Verweismatrix. |
| `docs/datenmodell.md` | Abschnitt „Phase-3-Erweiterungen …“ (bis Dateiende) entfällt; D-Verweise entfernt bzw. durch E-Verweise ersetzt, wo sinnvoll; heutiges Modell bleibt. |
| `tickets/phase-2-backlog.md`, `tickets/phase-3-backlog.md` | **Gelöscht** (Ordner `tickets/` entfällt). |
| `docs/architecture-annotated.html` | Satz „In Phase 3 wird nur der Adapter getauscht (z. B. Postgres `LISTEN/NOTIFY`).“ → „Für mehrere Prozesse würde nur der Adapter getauscht (z. B. Postgres `LISTEN/NOTIFY`).“; PNG neu rendern. |
| `README.md`, `CLAUDE.md` | „D19“ → „E2“; Links auf `docs/decisions.md` bleiben. |
| `examples/tickets/README.md` | Verweis „Vorlage für den Markdown-Import (T-17)“ → „Vorlage für den Ticket-Eingang“ (T-17 stammt aus dem gelöschten Backlog). |
| `docs/ui-ux-concept.md` | **Unverändert** — wird mit dem Umbau-Spec neu gefasst. |

Alle Skizzen ASCII in ```` ```text ````-Blöcken mit bündigen Rahmen (E5).

## 4. Abnahme

- `grep -rnE "\bD[0-9]{1,2}\b" docs README.md CLAUDE.md --exclude-dir=superpowers --exclude=ui-ux-concept.md` → keine Treffer.
- `grep -rniE "phase ?[2-5]|phase-[2-5]" docs README.md CLAUDE.md --exclude-dir=superpowers --exclude=ui-ux-concept.md` → keine Treffer.
- `ls tickets` → existiert nicht.
- Roadmap enthält die sechs Stufen mit Artefakt, Gate, Metrik und Status; Stufen 1+2 als Showcase markiert.
- `decisions.md` enthält genau E1–E5.
- Alle ASCII-Rahmen bündig (Längenprüfung pro Zeile).
- `architecture-annotated.png` neu gerendert, visuell geprüft.
- `npm test`, `npm run build`, `npm run lint` weiterhin grün (keine Codeänderung erwartet).
