import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

import { aTicket } from '@/test/fixtures'
import { Board } from './Board'

describe('Board', () => {
  it('groups the tickets into the stage columns', () => {
    render(<Board tickets={[aTicket({ key: 'CB-1' }), aTicket({ key: 'CB-2', stage: 'design' }), aTicket({ key: 'CB-3', stage: 'done' })]} />)
    expect(within(screen.getByRole('region', { name: '1 Plan' })).getByText('Titel CB-1')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '2 Design' })).getByText('Titel CB-2')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fertig' })).getByText('Titel CB-3')).toBeInTheDocument()
  })

  it('shows key, priority, state and the PR number in review', () => {
    render(<Board tickets={[
      aTicket({ key: 'CB-1', state: 'in_review', openPr: { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open' } }),
      aTicket({ key: 'CB-2', state: 'awaiting_answer', priority: null }),
    ]} />)
    expect(screen.getByText('in Review: PR #3')).toBeInTheDocument()
    expect(screen.getByText('Rückfrage')).toBeInTheDocument()
    expect(screen.getByText('CB-1')).toBeInTheDocument()
    expect(screen.getAllByText('Mittel')).toHaveLength(1)
  })

  it('links each card to its ticket page', () => {
    render(<Board tickets={[aTicket({ key: 'CB-1' })]} />)
    expect(screen.getByRole('link', { name: /Titel CB-1/ })).toHaveAttribute('href', '/tickets/CB-1')
  })

  it('shows empty columns', () => {
    render(<Board tickets={[]} />)
    expect(screen.getAllByText('Keine Tickets')).toHaveLength(3)
  })
})
