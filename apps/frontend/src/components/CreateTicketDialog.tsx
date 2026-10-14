import { useState } from 'react'
import { createTicket, type Ticket } from '../api/ticketApi'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

interface Props {
  onCreated: (ticket: Ticket) => void
}

export function CreateTicketDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      const ticket = await createTicket({ title, description })
      setOpen(false)
      setTitle('')
      setDescription('')
      onCreated(ticket)
    } catch (err) {
      console.error('Failed to create ticket:', err)
    } finally {
      setSaving(false)
    }
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
