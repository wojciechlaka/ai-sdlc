/**
 * The three example tickets restored by "Reset" and inserted into an empty database.
 * Target repo: https://github.com/wojciechlaka/node-express-realworld-example-app (Conduit blog API).
 */
export const SEED_TICKETS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: 'CB-1: Artikel als Entwurf speichern',
    description: 'Autoren wollen Artikel erst speichern und später veröffentlichen. Bis dahin soll sie niemand sonst sehen. Im Feed sollen Entwürfe natürlich nicht auftauchen.',
  },
  {
    title: 'CB-2: Lesezeit bei Artikeln anzeigen',
    description: 'Leser möchten vorher sehen, wie lange ein Artikel ungefähr dauert. Die Angabe sollte in der API mitkommen, damit das Frontend sie anzeigen kann.',
  },
  {
    title: 'CB-3: Unangemessene Kommentare melden',
    description: 'Unter manchen Artikeln landen Spam oder beleidigende Kommentare. Leser sollen solche Kommentare melden können, und irgendwer muss sich dann darum kümmern.',
  },
]
