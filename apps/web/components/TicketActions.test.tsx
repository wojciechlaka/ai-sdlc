import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { TicketDetailDto } from '@refinement/shared'
import type { SSEHandlers } from '@/hooks/useSSE'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

vi.mock('@/app/actions', () => ({
  startStageAction: vi.fn(),
  stopRunAction: vi.fn(),
  answerQuestionAction: vi.fn(),
}))

const sse = vi.hoisted(() => ({
  handlers: null as null | SSEHandlers,
}))
vi.mock('@/hooks/useSSE', () => ({
  useSSE: (_key: string | null, handlers: SSEHandlers) => {
    sse.handlers = handlers
    return { connected: true, everConnected: true }
  },
}))

import { startStageAction, stopRunAction } from '@/app/actions'
import { DEFAULT_MODEL } from '@/lib/models'
import { AppStateProvider } from './AppStateProvider'
import { aTicketDetail } from '@/test/fixtures'
import { TicketActions } from './TicketActions'

function renderActions(patch: Partial<TicketDetailDto> = {}, tokenConfigured = true) {
  return render(
    <AppStateProvider>
      <TicketActions ticket={aTicketDetail(patch)} tokenConfigured={tokenConfigured} />
    </AppStateProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TicketActions', () => {
  it('starts the plan stage with the default model', async () => {
    vi.mocked(startStageAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Plan starten' }))
    await waitFor(() => expect(startStageAction).toHaveBeenCalledWith('CB-2', { model: DEFAULT_MODEL }))
  })

  it('disables the start without token and says why', () => {
    renderActions({}, false)
    expect(screen.getByRole('button', { name: 'Plan starten' })).toBeDisabled()
    expect(screen.getByText(/GITHUB_TOKEN fehlt/)).toBeInTheDocument()
  })

  it('shows the error of a rejected action', async () => {
    vi.mocked(startStageAction).mockResolvedValue({ ok: false, error: 'Stufe kann im Zustand plan/running nicht gestartet werden' })
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Plan starten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht gestartet werden')
  })

  it('offers a restart after a failure', () => {
    renderActions({ state: 'failed' })
    expect(screen.getByText(/fehlgeschlagen — Details im Log/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan starten' })).toBeEnabled()
  })

  it('shows the progress of a running agent and stops it', async () => {
    vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions({ state: 'running' })
    act(() => sse.handlers?.onMessage({ type: 'progress', ticketKey: 'CB-2', message: 'Codebase wird analysiert…' }))
    expect(screen.getByText('Codebase wird analysiert…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan starten' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stoppen' }))
    await waitFor(() => expect(stopRunAction).toHaveBeenCalledWith('CB-2'))
  })

  it('shows the question while waiting for an answer', () => {
    renderActions({ state: 'awaiting_answer', pendingQuestion: 'Gilt das auch für Entwürfe?' })
    expect(screen.getByText('Gilt das auch für Entwürfe?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antworten' })).toBeInTheDocument()
  })

  it('lets the user cancel while waiting for an answer', async () => {
    vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions({ state: 'awaiting_answer', pendingQuestion: 'Frage?' })
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(stopRunAction).toHaveBeenCalledWith('CB-2'))
  })

  it('links the open PR while in review', () => {
    renderActions({ state: 'in_review', openPr: { number: 3, url: 'https://github.com/o/r/pull/3', state: 'open' } })
    expect(screen.getByRole('link', { name: 'PR #3 öffnen' })).toHaveAttribute('href', 'https://github.com/o/r/pull/3')
    expect(screen.getByText(/Merge auf GitHub = Freigabe/)).toBeInTheDocument()
  })

  it('keeps the design stage disabled until stage 2 exists', () => {
    renderActions({ stage: 'design' })
    expect(screen.getByRole('button', { name: 'Design starten' })).toBeDisabled()
  })

  it('reports a finished ticket', () => {
    renderActions({ stage: 'done' })
    expect(screen.getByText('Alle Stufen abgeschlossen.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('refreshes the page on state and question events and after a reconnect', () => {
    renderActions({ state: 'running' })
    act(() => sse.handlers?.onMessage({ type: 'state', ticketKey: 'CB-2', stage: 'plan', state: 'in_review' }))
    act(() => sse.handlers?.onReconnect?.())
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})
