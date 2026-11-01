'use client'

import { useState } from 'react'
import type { ChoiceId, PendingChoice } from '@refinement/shared'
import { answerQuestionAction } from '@/app/actions'
import { useServerAction } from '@/hooks/useServerAction'
import { inlineCode } from '@/lib/inlineCode'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  ticketKey: string
  /** Approaches the agent offers; the recommended one is preselected. */
  choice: PendingChoice
  /** „Rückfrage N von 3“; absent without limit. */
  counter?: string
  /** Called after the pick was accepted. */
  onAnswered: () => void
  /** Ends the attempt (same as „Abbrechen“ next to a question). */
  onCancel: () => void
  /** The cancel action is running. */
  cancelPending: boolean
}

/**
 * Amber card with the agent's choice: question as legend, one radio per approach (title, description, pros and
 * cons; the recommendation marked and preselected), an optional note, „Auswahl senden“ and „Abbrechen“.
 * Native radios in a fieldset keep it keyboard-operable (Tab into the group, arrow keys between options).
 */
export function ChoicePanel({ ticketKey, choice, counter, onAnswered, onCancel, cancelPending }: Props) {
  const [selected, setSelected] = useState<ChoiceId | null>(choice.recommended)
  const [note, setNote] = useState('')
  const { run, pending: sending, error } = useServerAction()

  const handleSubmit = () => {
    if (!selected) {
      return
    }
    const input = note.trim() ? { choice: selected, note: note.trim() } : { choice: selected }
    run(() => answerQuestionAction(ticketKey, input), onAnswered)
  }

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-900">Auswahl vom Agent</CardTitle>
        {counter && <p className="text-xs text-amber-800">{counter}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm">{inlineCode(choice.question)}</legend>
          {choice.options.map((option) => {
            const recommended = option.id === choice.recommended
            const baseId = `choice-${ticketKey}-${option.id}`
            return (
              <label key={option.id} className="flex cursor-pointer gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm">
                <input
                  type="radio"
                  name={`choice-${ticketKey}`}
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => setSelected(option.id)}
                  aria-labelledby={`${baseId}-title`}
                  aria-describedby={`${baseId}-details`}
                  className="mt-1"
                />
                <span className="block space-y-1">
                  <span id={`${baseId}-title`} className="font-medium">
                    Ansatz {option.id}: {inlineCode(option.title)}
                    {recommended && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs">empfohlen</span>}
                  </span>
                  <span id={`${baseId}-details`} className="block space-y-1">
                    <span className="block text-slate-700">{inlineCode(option.description)}</span>
                    {option.pros.map((pro, index) => (
                      <span key={index} className="block text-emerald-700">+ {inlineCode(pro)}</span>
                    ))}
                    {option.cons.map((con, index) => (
                      <span key={index} className="block text-red-700">− {inlineCode(con)}</span>
                    ))}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <Textarea
          aria-label="Anmerkung (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anmerkung (optional)…"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={sending || cancelPending || !selected} size="sm">
            {sending ? 'Sende…' : 'Auswahl senden'}
          </Button>
          <Button variant="outline" size="sm" disabled={cancelPending || sending} onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
