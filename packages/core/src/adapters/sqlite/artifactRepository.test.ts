import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDatabase } from '../../testing/testDb'
import { sourceTicket } from '../../testing/fakes'
import { createSqliteTicketRepository } from './ticketRepository'
import { createSqliteArtifactRepository } from './artifactRepository'
import type { ArtifactRepository, TicketRepository } from '../../ports'

let tickets: TicketRepository
let artifacts: ArtifactRepository

beforeEach(() => {
  const db = createTestDatabase()
  tickets = createSqliteTicketRepository(db)
  artifacts = createSqliteArtifactRepository(db)
  tickets.upsertFromSource([sourceTicket('CB-1')])
})

const open = (prNumber: number) =>
  artifacts.create({
    ticketKey: 'CB-1', stage: 'plan', path: 'docs/work/CB-1/intent.md', branch: 'CB-1/intent',
    prNumber, prUrl: `https://github.com/o/r/pull/${prNumber}`,
  })

describe('artifacts', () => {
  it('records an open PR', () => {
    expect(open(7)).toMatchObject({ prNumber: 7, prState: 'open', mergedAt: null, branch: 'CB-1/intent' })
  })

  it('finds the newest open artifact of a stage', () => {
    const first = open(1)
    artifacts.markClosed(first.id)
    const second = open(2)
    expect(artifacts.findOpen('CB-1', 'plan')?.id).toBe(second.id)
    expect(artifacts.findOpen('CB-1', 'design')).toBeNull()
  })

  it('marks merges with their time', () => {
    const artifact = open(3)
    const at = new Date('2026-10-28T12:00:00Z')
    artifacts.markMerged(artifact.id, at)
    expect(artifacts.listForTicket('CB-1')[0]).toMatchObject({ prState: 'merged', mergedAt: at })
    expect(artifacts.findOpen('CB-1', 'plan')).toBeNull()
  })

  it('lists artifacts oldest first and removes them with the ticket', () => {
    open(1)
    open(2)
    expect(artifacts.listForTicket('CB-1').map((a) => a.prNumber)).toEqual([1, 2])
    tickets.clear()
    expect(artifacts.listForTicket('CB-1')).toEqual([])
  })
})
