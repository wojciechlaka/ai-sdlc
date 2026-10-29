import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { RefinementEvent, TicketDetailDto } from '@refinement/shared'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

vi.mock('@/app/actions', () => ({
  startRefinementAction: vi.fn(),
  stopRefinementAction: vi.fn(),
  deleteTicketAction: vi.fn(),
  answerQuestionAction: vi.fn(),
}))

const sse = vi.hoisted(() => ({
  handlers: null as null | { onMessage: (e: RefinementEvent) => void; onReconnect?: () => void },
}))
vi.mock('@/hooks/useSSE', () => ({
  useSSE: (_ticketId: string, handlers: { onMessage: (e: RefinementEvent) => void; onReconnect?: () => void }) => {
    sse.handlers = handlers
    return { connected: true, everConnected: true }
  },
}))

import { startRefinementAction, deleteTicketAction, answerQuestionAction } from '@/app/actions'
import { AppStateProvider } from './AppStateProvider'
import { TicketLive } from './TicketLive'
import { DEFAULT_MODEL } from '@/lib/constants'

const NOW = new Date('2026-10-28T10:00:00Z')

const BACKLOG: TicketDetailDto = {
  id: 'T-1', title: 'CC-2', description: 'Desc', status: 'backlog', iteration: 0,
  createdAt: NOW, updatedAt: NOW, latestRun: null,
}

const WAITING_FOR_ANSWER: TicketDetailDto = {
  ...BACKLOG,
  status: 'refining',
  iteration: 1,
  latestRun: {
    id: 'run-1', ticketId: 'T-1', iteration: 1, trigger: 'initial', status: 'succeeded', model: DEFAULT_MODEL,
    output: { type: 'question', question: 'Welche DB?' }, costUsd: 0.01, inputTokens: 100,
    cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 10, startedAt: NOW, finishedAt: NOW,
  },
}

function renderLive(ticket: TicketDetailDto) {
  return render(
    <AppStateProvider>
      <TicketLive ticket={ticket}>
        <p>Beschreibung</p>
      </TicketLive>
    </AppStateProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('TicketLive', () => {
  it('disables Refine without a repository', async () => {
    renderLive(BACKLOG)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled())
  })

  it('starts a refinement with the stored repository and the default model', async () => {
    localStorage.setItem('repoUrl', 'https://github.com/x/y')
    vi.mocked(startRefinementAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(BACKLOG)

    const refine = screen.getByRole('button', { name: 'Refine' })
    await waitFor(() => expect(refine).toBeEnabled())
    fireEvent.click(refine)

    await waitFor(() =>
      expect(startRefinementAction).toHaveBeenCalledWith('T-1', {
        repo: 'https://github.com/x/y', model: DEFAULT_MODEL, acceptanceCriteria: '',
      }),
    )
  })

  it('shows the error returned by an action', async () => {
    localStorage.setItem('repoUrl', 'https://github.com/x/y')
    vi.mocked(startRefinementAction).mockResolvedValue({ ok: false, error: 'Ticket is not in a refineable state' })
    renderLive(BACKLOG)

    const refine = screen.getByRole('button', { name: 'Refine' })
    await waitFor(() => expect(refine).toBeEnabled())
    fireEvent.click(refine)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket is not in a refineable state')
  })

  it('navigates home after deleting', async () => {
    vi.mocked(deleteTicketAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(BACKLOG)

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'))
    expect(deleteTicketAction).toHaveBeenCalledWith('T-1')
  })

  it('shows the pending question and hides it once answered', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    renderLive(WAITING_FOR_ANSWER)

    expect(screen.getByText('Welche DB?')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben...'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    await waitFor(() => expect(screen.queryByText('Welche DB?')).not.toBeInTheDocument())
  })

  it('appends progress events and refreshes the page on status and question events', () => {
    renderLive({ ...WAITING_FOR_ANSWER, latestRun: { ...WAITING_FOR_ANSWER.latestRun!, status: 'running', output: null } })

    act(() => sse.handlers!.onMessage({ type: 'progress', ticketId: 'T-1', message: 'Codebase wird analysiert...' }))
    expect(screen.getByText('Codebase wird analysiert...')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()

    act(() => sse.handlers!.onMessage({ type: 'status', ticketId: 'T-1', status: 'review' }))
    act(() => sse.handlers!.onMessage({ type: 'question', ticketId: 'T-1', question: 'Q?' }))
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })

  it('refreshes the page when the SSE connection reconnects', () => {
    renderLive(BACKLOG)
    act(() => sse.handlers!.onReconnect!())
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps Refine disabled while refining, even with a repository', async () => {
    localStorage.setItem('repoUrl', 'https://github.com/x/y')
    renderLive({ ...WAITING_FOR_ANSWER, latestRun: { ...WAITING_FOR_ANSWER.latestRun!, status: 'running', output: null } })

    expect(screen.getByRole('button', { name: 'Stoppen' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled())
  })

  it('does not show the persisted question when the ticket is not refining', () => {
    renderLive({ ...WAITING_FOR_ANSWER, status: 'review' })
    expect(screen.queryByText('Welche DB?')).not.toBeInTheDocument()
  })

  it('renders the server-rendered children', () => {
    renderLive(BACKLOG)
    expect(screen.getByText('Beschreibung')).toBeInTheDocument()
  })
})
