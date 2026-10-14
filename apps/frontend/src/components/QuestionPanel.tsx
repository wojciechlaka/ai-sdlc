// frontend/src/components/QuestionPanel.tsx
import { useState } from 'react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { sendAnswer } from '../api/ticketApi'

interface Props {
  ticketId: string
  /** Question text sent by the Claude agent via ask_human. */
  question: string
  /** Called after the answer is successfully delivered to the backend. */
  onAnswered: () => void
}

/**
 * Amber card shown when the Claude agent is waiting for a human answer.
 * Renders the agent's question and a textarea for the user's reply,
 * then POSTs the answer via sendAnswer and notifies the parent.
 */
export function QuestionPanel({ ticketId, question, onAnswered }: Props) {
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setSending(true)
    try {
      await sendAnswer(ticketId, answer)
      setAnswer('')
      onAnswered()
    } catch (err) {
      console.error('Failed to send answer:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="mt-4 border-amber-200 bg-amber-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-900">Frage vom Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{question}</p>
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Antwort eingeben..."
        />
        <Button
          onClick={handleSubmit}
          disabled={sending || !answer.trim()}
          size="sm"
        >
          {sending ? 'Sende...' : 'Antworten'}
        </Button>
      </CardContent>
    </Card>
  )
}
