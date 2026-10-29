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

  it('shows the counter at a question of the design stage only', () => {
    const { unmount } = renderActions({ stage: 'design', state: 'awaiting_answer', pendingQuestion: 'Wer?', questionsAsked: 2, questionLimit: 3 })
    expect(screen.getByText('Rückfrage 2 von 3')).toBeInTheDocument()
    unmount()
    renderActions({ state: 'awaiting_answer', pendingQuestion: 'Wer?', questionsAsked: 2, questionLimit: null })
    expect(screen.queryByText(/Rückfrage \d von/)).toBeNull()
  })

  it('shows a choice instead of the question panel and cancels from it', async () => {
    vi.mocked(stopRunAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions({
      stage: 'design', state: 'awaiting_answer', questionsAsked: 1, questionLimit: 3,
      pendingChoice: {
        question: 'Wo wird die Lesezeit berechnet?', recommended: 'A',
        options: [
          { id: 'A', title: 'Beim Speichern', description: 'd', pros: [], cons: [] },
          { id: 'B', title: 'Beim Lesen', description: 'd', pros: [], cons: [] },
        ],
      },
    })
    expect(screen.getByRole('group', { name: 'Wo wird die Lesezeit berechnet?' })).toBeInTheDocument()
    expect(screen.getByText('Rückfrage 1 von 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Antworten' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Abbrechen' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(stopRunAction).toHaveBeenCalledWith('CB-2'))
  })

  it('resets selection and note when a new choice arrives', () => {
    const choice = (question: string) => ({
      question, recommended: 'A' as const,
      options: [
        { id: 'A' as const, title: 'Beim Speichern', description: 'd', pros: [], cons: [] },
        { id: 'B' as const, title: 'Beim Lesen', description: 'd', pros: [], cons: [] },
      ],
    })
    const ui = (patch: Partial<TicketDetailDto>) => (
      <AppStateProvider>
        <TicketActions ticket={aTicketDetail({ stage: 'design', state: 'awaiting_answer', questionLimit: 3, ...patch })} tokenConfigured />
      </AppStateProvider>
    )
    const { rerender } = render(ui({ questionsAsked: 1, pendingChoice: choice('Erste Wahl?') }))
    fireEvent.click(screen.getByRole('radio', { name: /Ansatz B/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Anmerkung (optional)' }), { target: { value: 'alt' } })

    rerender(ui({ questionsAsked: 2, pendingChoice: choice('Zweite Wahl?') }))

    expect(screen.getByRole('radio', { name: /Ansatz A/ })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Anmerkung (optional)' })).toHaveValue('')
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

  it('starts the design stage with the chosen model and explains what the agent does', async () => {
    vi.mocked(startStageAction).mockResolvedValue({ ok: true, data: undefined })
    renderActions({ stage: 'design' })
    const start = screen.getByRole('button', { name: 'Design starten' })
    expect(start).toHaveAccessibleDescription(
      'Der Design-Agent liest den gemergten Intent und die Codebase; er stellt höchstens 3 Rückfragen oder Auswahlen.',
    )
    expect(screen.queryByText(/noch nicht gebaut/)).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Modell' }), { target: { value: 'claude-opus-4-7' } })
    fireEvent.click(start)
    await waitFor(() => expect(startStageAction).toHaveBeenCalledWith('CB-2', { model: 'claude-opus-4-7' }))
  })

  it('offers a restart of a failed design stage and disables it without token', () => {
    const { unmount } = renderActions({ stage: 'design', state: 'failed' })
    expect(screen.getByText(/fehlgeschlagen — Details im Log/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Design starten' })).toBeEnabled()
    unmount()

    renderActions({ stage: 'design' }, false)
    expect(screen.getByRole('button', { name: 'Design starten' })).toBeDisabled()
    expect(screen.getByText(/GITHUB_TOKEN fehlt/)).toBeInTheDocument()
  })

  it('reports a finished ticket', () => {
    renderActions({ stage: 'done' })
    expect(screen.getByText('Alle Stufen abgeschlossen.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('waits for the sync while the state promises a question or PR the page does not have yet', () => {
    const { unmount } = renderActions({ state: 'awaiting_answer', pendingQuestion: null })
    expect(screen.getByText('Zustand wird abgeglichen…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeEnabled()
    unmount()

    renderActions({ state: 'in_review', openPr: null })
    expect(screen.getByText('Zustand wird abgeglichen…')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('refreshes the page on state and question events and after a reconnect', () => {
    renderActions({ state: 'running' })
    act(() => sse.handlers?.onMessage({ type: 'state', ticketKey: 'CB-2', stage: 'plan', state: 'in_review' }))
    act(() => sse.handlers?.onReconnect?.())
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })
})
