'use client'

import { useState, useTransition } from 'react'
import { answerQuestionAction } from '@/app/actions'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface Props {
  ticketKey: string
  /** Question asked by the agent. */
  question: string
  /** Called after the answer was accepted. */
  onAnswered: () => void
}

/** Amber card shown while the agent waits for a human answer. */
export function QuestionPanel({ ticketKey, question, onAnswered }: Props) {
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!answer.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await answerQuestionAction(ticketKey, { answer })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAnswer('')
      onAnswered()
    })
  }

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-900">Frage vom Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{question}</p>
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Antwort eingeben..." />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={handleSubmit} disabled={sending || !answer.trim()} size="sm">
          {sending ? 'Sende...' : 'Antworten'}
        </Button>
      </CardContent>
    </Card>
  )
}
