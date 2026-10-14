export const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  backlog:   'outline',
  refining:  'secondary',
  review:    'default',
  ready:     'default',
  failed:    'outline',
}

export const STATUS_LABEL: Record<string, string> = {
  backlog:   'Backlog',
  refining:  'In Bearbeitung',
  review:    'Review',
  ready:     'Bereit',
  failed:    'Fehlgeschlagen',
}

// Anthropic provides no pricing API — values must be updated manually.
// Last verified: 2026-06-26 — https://docs.anthropic.com/en/docs/about-claude/pricing
export const MODEL_PRICING: Record<string, { inputPerMtok: number; outputPerMtok: number }> = {
  'claude-haiku-4-5-20251001': { inputPerMtok: 1.00,  outputPerMtok:  5.00 },
  'claude-sonnet-4-6':         { inputPerMtok: 3.00,  outputPerMtok: 15.00 },
  'claude-opus-4-7':           { inputPerMtok: 5.00,  outputPerMtok: 25.00 },
}

export const MTOK = 1_000_000
export const CACHE_WRITE_MULTIPLIER = 1.25
export const CACHE_READ_MULTIPLIER = 0.10

export interface AgentRun {
  id: string
  ticketId: number
  iteration: number
  trigger: 'initial' | 'answer' | 'rework'
  status: 'running' | 'succeeded' | 'failed' | 'timeout'
  model: string
  output?:
    | { type: 'question'; question: string }
    | { type: 'refinement'; result: {
        title: string
        userStory: string
        acceptanceCriteria: string[]
        affectedFiles: Array<{ path: string; description: string }>
        risks: Array<{ description: string; severity: 'low' | 'medium' | 'high' }>
        openQuestions: Array<{ question: string; blocksImplementation: boolean }>
        confidence: number
      }}
    | null
  costUsd?: number | null
  inputTokens?: number | null
  cacheCreationTokens?: number | null
  cacheReadTokens?: number | null
  outputTokens?: number | null
  startedAt: string
  finishedAt?: string | null
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: 'backlog' | 'refining' | 'review' | 'ready' | 'failed'
  iteration: number
  createdAt: string
  updatedAt: string
  latestRun?: AgentRun | null
}

export async function fetchTickets(): Promise<Ticket[]> {
  const res = await fetch('/tickets')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const res = await fetch(`/tickets/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error(`Empty response for ticket ${id}`)
  return JSON.parse(text)
}

export async function startRefinement(id: string, params: { repo: string; model: string; acceptanceCriteria?: string }): Promise<void> {
  const res = await fetch(`/tickets/${id}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: params.repo, model: params.model, acceptanceCriteria: params.acceptanceCriteria ?? '' }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function sendAnswer(id: string, answer: string): Promise<void> {
  const res = await fetch(`/tickets/${id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (res.status !== 202) throw new Error(`HTTP ${res.status}`)
}

export async function stopRefinement(id: string): Promise<void> {
  const res = await fetch(`/tickets/${id}/stop`, { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function deleteTicket(id: string): Promise<void> {
  const res = await fetch(`/tickets/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function createTicket(input: { title: string; description: string }): Promise<Ticket> {
  const res = await fetch('/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function resetSystem(): Promise<Ticket[]> {
  const res = await fetch('/system/reset', { method: 'POST' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
