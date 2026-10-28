import { describe, it, expect } from 'vitest'
import { SEED_TICKETS } from './seeds'

describe('SEED_TICKETS', () => {
  it('are the three Conduit blog tickets', () => {
    expect(SEED_TICKETS.map((t) => t.title)).toEqual([
      'CB-1: Artikel als Entwurf speichern',
      'CB-2: Lesezeit bei Artikeln anzeigen',
      'CB-3: Unangemessene Kommentare melden',
    ])
  })

  it('have a non-empty description', () => {
    expect(SEED_TICKETS.every((t) => t.description.trim().length > 0)).toBe(true)
  })
})
