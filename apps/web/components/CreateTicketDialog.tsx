'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTicketAction } from '@/app/actions'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

export function CreateTicketDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) return
    startTransition(async () => {
      setError(null)
      const result = await createTicketAction({ title, description })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      setTitle('')
      setDescription('')
      router.push(`/tickets/${result.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        + Neues Ticket
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Ticket erstellen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="title">Titel</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Was soll implementiert werden?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Kontext, Motivation, bekannte Constraints…"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !description.trim()}
            className="w-full"
          >
            {saving ? 'Erstelle…' : 'Ticket erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
