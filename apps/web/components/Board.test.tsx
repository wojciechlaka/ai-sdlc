import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import type { TicketDto } from '@refinement/shared'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

import { Board } from './Board'

const NOW = new Date('2026-10-28T10:00:00Z')

function ticket(key: string, patch: Partial<TicketDto> = {}): TicketDto {
  return {
    key, title: `Titel ${key}`, description: 'D', priority: 'Mittel', sourcePath: `examples/tickets/${key}.md`,
    stage: 'plan', state: 'ready', openPr: null, updatedAt: NOW, ...patch,
  }
}

describe('Board', () => {
  it('groups the tickets into the stage columns', () => {
    render(<Board tickets={[ticket('CB-1'), ticket('CB-2', { stage: 'design' }), ticket('CB-3', { stage: 'done' })]} />)
    expect(within(screen.getByRole('region', { name: '1 Plan' })).getByText('Titel CB-1')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '2 Design' })).getByText('Titel CB-2')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fertig' })).getByText('Titel CB-3')).toBeInTheDocument()
  })

  it('shows key, priority, state and the PR number in review', () => {
    render(<Board tickets={[
      ticket('CB-1', { state: 'in_review', openPr: { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open' } }),
      ticket('CB-2', { state: 'awaiting_answer', priority: null }),
    ]} />)
    expect(screen.getByText('in Review: PR #3')).toBeInTheDocument()
    expect(screen.getByText('Rückfrage')).toBeInTheDocument()
    expect(screen.getByText('CB-1')).toBeInTheDocument()
    expect(screen.getAllByText('Mittel')).toHaveLength(1)
  })

  it('links each card to its ticket page', () => {
    render(<Board tickets={[ticket('CB-1')]} />)
    expect(screen.getByRole('link', { name: /Titel CB-1/ })).toHaveAttribute('href', '/tickets/CB-1')
  })

  it('shows empty columns', () => {
    render(<Board tickets={[]} />)
    expect(screen.getAllByText('Keine Tickets')).toHaveLength(3)
  })
})
