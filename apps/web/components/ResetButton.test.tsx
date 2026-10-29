import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/app/actions', () => ({ resetSystemAction: vi.fn() }))

import { resetSystemAction } from '@/app/actions'
import { AppStateProvider } from './AppStateProvider'
import { ResetButton } from './ResetButton'

function renderButton() {
  return render(
    <AppStateProvider>
      <ResetButton baseBranch="demo" baselineTag="demo-base" />
    </AppStateProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResetButton', () => {
  it('asks before resetting and names the base branch and baseline tag from the settings', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(confirm).toHaveBeenCalledWith(
      'Datenbank leeren, Tickets neu einlesen, offene PRs der App schließen und den Branch demo auf demo-base zurücksetzen?',
    )
    expect(resetSystemAction).not.toHaveBeenCalled()
  })

  it('shows the warnings of the reset below the button', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(resetSystemAction).mockResolvedValue({ ok: true, data: { warnings: ['Repo nicht zurückgesetzt: Branch-Schutz'] } })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Repo nicht zurückgesetzt: Branch-Schutz')
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('shows nothing extra after a clean reset', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(resetSystemAction).mockResolvedValue({ ok: true, data: { warnings: [] } })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
