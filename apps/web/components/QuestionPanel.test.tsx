import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions', () => ({ answerQuestionAction: vi.fn() }))

import { answerQuestionAction } from '@/app/actions'
import { QuestionPanel } from './QuestionPanel'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuestionPanel', () => {
  it('shows the question and disables sending an empty answer', () => {
    render(<QuestionPanel ticketKey="CB-1" question="Welche DB?" onAnswered={vi.fn()} />)
    expect(screen.getByText('Welche DB?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antworten' })).toBeDisabled()
  })

  it('sends the answer and notifies the parent', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    const onAnswered = vi.fn()
    render(<QuestionPanel ticketKey="CB-1" question="Welche DB?" onAnswered={onAnswered} />)

    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben…'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    await waitFor(() => expect(onAnswered).toHaveBeenCalled())
    expect(answerQuestionAction).toHaveBeenCalledWith('CB-1', { answer: 'Postgres' })
  })

  it('keeps the answer and shows the error when the action fails', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: false, error: 'Answer already in progress' })
    const onAnswered = vi.fn()
    render(<QuestionPanel ticketKey="CB-1" question="Welche DB?" onAnswered={onAnswered} />)

    fireEvent.change(screen.getByPlaceholderText('Antwort eingeben…'), { target: { value: 'Postgres' } })
    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Answer already in progress')
    expect(onAnswered).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Antwort eingeben…')).toHaveValue('Postgres')
  })
})
