import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PendingChoice } from '@refinement/shared'

vi.mock('@/app/actions', () => ({ answerQuestionAction: vi.fn() }))

import { answerQuestionAction } from '@/app/actions'
import { ChoicePanel } from './ChoicePanel'

const CHOICE: PendingChoice = {
  question: 'Wo wird die Lesezeit berechnet?',
  options: [
    { id: 'A', title: 'Beim Speichern', description: 'Feld am Artikel.', pros: ['schnell beim Lesen'], cons: ['Migration'] },
    { id: 'B', title: 'Beim Lesen', description: 'Im Service.', pros: ['keine Migration'], cons: ['Rechenzeit pro Abruf'] },
  ],
  recommended: 'B',
}

function renderPanel(patch: Partial<Parameters<typeof ChoicePanel>[0]> = {}) {
  const props = { ticketKey: 'CB-2', choice: CHOICE, counter: 'Rückfrage 1 von 3', onAnswered: vi.fn(), onCancel: vi.fn(), cancelPending: false, ...patch }
  render(<ChoicePanel {...props} />)
  return props
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChoicePanel', () => {
  it('shows the question as legend, every option with pros and cons, and the counter', () => {
    renderPanel()
    expect(screen.getByRole('group', { name: 'Wo wird die Lesezeit berechnet?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Ansatz A: Beim Speichern/ })).toHaveAccessibleDescription(/Feld am Artikel\..*\+ schnell beim Lesen.*− Migration/)
    expect(screen.getByText('Rückfrage 1 von 3')).toBeInTheDocument()
  })

  it('marks and preselects the recommended option', () => {
    renderPanel()
    expect(screen.getByRole('radio', { name: /Ansatz B: Beim Lesen.*empfohlen/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Ansatz A/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Auswahl senden' })).toBeEnabled()
  })

  it('sends the picked option with the note and notifies the parent', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    const props = renderPanel()
    fireEvent.click(screen.getByRole('radio', { name: /Ansatz A/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Anmerkung (optional)' }), { target: { value: ' Migration ist ok ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))

    await waitFor(() => expect(props.onAnswered).toHaveBeenCalled())
    expect(answerQuestionAction).toHaveBeenCalledWith('CB-2', { choice: 'A', note: 'Migration ist ok' })
  })

  it('sends the recommendation without a note', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: true, data: undefined })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))
    await waitFor(() => expect(answerQuestionAction).toHaveBeenCalledWith('CB-2', { choice: 'B' }))
  })

  it('shows the error of a rejected pick', async () => {
    vi.mocked(answerQuestionAction).mockResolvedValue({ ok: false, error: 'Ansatz C wurde nicht angeboten' })
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Auswahl senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ansatz C wurde nicht angeboten')
    expect(props.onAnswered).not.toHaveBeenCalled()
  })

  it('disables sending while the cancel action is pending', () => {
    renderPanel({ cancelPending: true })
    expect(screen.getByRole('button', { name: 'Auswahl senden' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
  })

  it('names a radio by title and badge only, not by its description', () => {
    renderPanel()
    expect(screen.getByRole('radio', { name: /^Ansatz B: Beim Lesen\s*empfohlen$/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ansatz A: Beim Speichern' })).toBeInTheDocument()
  })

  it('renders repeated pros without React key warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const options = [
      { ...CHOICE.options[0]!, pros: ['schnell', 'schnell'] },
      CHOICE.options[1]!,
    ]
    renderPanel({ choice: { ...CHOICE, options } })
    expect(screen.getAllByText('+ schnell')).toHaveLength(2)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('cancels through the parent', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('is keyboard-operable: native radios in one group, all focusable', () => {
    renderPanel()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(new Set(radios.map((radio) => radio.getAttribute('name')))).toEqual(new Set(['choice-CB-2']))
    radios[0]!.focus()
    expect(radios[0]).toHaveFocus()
  })

  it('renders backtick text as code elements instead of literal backticks', () => {
    const choice: PendingChoice = {
      ...CHOICE,
      options: [{ ...CHOICE.options[0], description: 'Setzt `draft=true` beim Anlegen.' }, CHOICE.options[1]],
    }
    renderPanel({ choice })
    const code = screen.getByText('draft=true')
    expect(code.tagName).toBe('CODE')
    expect(screen.queryByText(/`/)).not.toBeInTheDocument()
  })
})
