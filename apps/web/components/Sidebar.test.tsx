import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/actions', () => ({ resetSystemAction: vi.fn() }))

import { AppStateProvider } from './AppStateProvider'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows the target repository and the branch the app works on', () => {
    render(
      <AppStateProvider>
        <Sidebar settings={{ repoUrl: 'https://github.com/o/r', baseBranch: 'showcase', baselineTag: 'showcase-base', tokenConfigured: true }} />
      </AppStateProvider>,
    )
    expect(screen.getByRole('link', { name: 'o/r' })).toHaveAttribute('href', 'https://github.com/o/r')
    expect(screen.getByText('Branch: showcase')).toBeInTheDocument()
  })
})
