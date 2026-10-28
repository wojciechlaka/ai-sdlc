import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/app/actions', () => ({ createTicketAction: vi.fn() }))

import { createTicketAction } from '@/app/actions'
import { CreateTicketDialog } from './CreateTicketDialog'

beforeEach(() => {
  vi.clearAllMocks()
})

async function openAndFill(title: string, description: string) {
  render(<CreateTicketDialog />)
  fireEvent.click(screen.getByRole('button', { name: '+ Neues Ticket' }))
  fireEvent.change(await screen.findByLabelText('Titel'), { target: { value: title } })
  fireEvent.change(screen.getByLabelText('Beschreibung'), { target: { value: description } })
}

describe('CreateTicketDialog', () => {
  it('disables submit until title and description are filled', async () => {
    await openAndFill('Neu', '')
    expect(screen.getByRole('button', { name: 'Ticket erstellen' })).toBeDisabled()
  })

  it('creates the ticket and opens it', async () => {
    vi.mocked(createTicketAction).mockResolvedValue({ ok: true, data: { id: 'T-7' } as never })
    await openAndFill('Neu', 'Beschreibung')

    fireEvent.click(screen.getByRole('button', { name: 'Ticket erstellen' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/tickets/T-7'))
    expect(createTicketAction).toHaveBeenCalledWith({ title: 'Neu', description: 'Beschreibung' })
  })

  it('shows the error returned by the action', async () => {
    vi.mocked(createTicketAction).mockResolvedValue({ ok: false, error: 'Titel ist erforderlich' })
    await openAndFill('Neu', 'Beschreibung')

    fireEvent.click(screen.getByRole('button', { name: 'Ticket erstellen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Titel ist erforderlich')
    expect(router.push).not.toHaveBeenCalled()
  })
})
