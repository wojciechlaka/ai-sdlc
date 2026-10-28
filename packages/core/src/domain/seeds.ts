/** The three example tickets restored by "Reset" and inserted into an empty database. */
export const SEED_TICKETS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: 'CC-1: Eigene Fragen hinzufügen',
    description: 'Aktuell gibt es nur die fest eingebauten Fragen. Mehrere Teams haben gefragt, ob sie eigene Fragen verwenden können, z. B. firmenspezifische oder zum aktuellen Teamevent. Der Host sollte beim Erstellen des Spiels irgendwie eigene Fragen eingeben können.',
  },
  {
    title: 'CC-2: Timer für die Antwortphase',
    description: 'Manche Runden ziehen sich ewig, weil einzelne Spieler nicht antworten. Es wäre gut, wenn es ein Zeitlimit gäbe, damit das Spiel weitergeht. Der Host sollte das vielleicht einstellen können.',
  },
  {
    title: 'CC-3: Spieler fliegen bei Verbindungsabbruch raus',
    description: 'Wenn jemand kurz die Verbindung verliert (Laptop zugeklappt, WLAN-Wechsel), ist er aus dem Spiel raus und die Runde hängt. Spieler sollten wieder reinkommen können, ohne dass das Spiel kaputtgeht.',
  },
]
