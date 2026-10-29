import { MODELS } from '@/lib/constants'

interface Props {
  value: string
  onChange: (model: string) => void
  /** Disables the select while an agent is running. */
  disabled?: boolean
  /** 'sm' renders a compact inline variant; 'md' (default) renders full-width. */
  size?: 'sm' | 'md'
}

/**
 * Dropdown for picking the Claude model used for a stage run.
 * No `'use client'`: it takes a function prop, so it is rendered only inside client components (TicketActions).
 */
export function ModelSelect({ value, onChange, disabled = false, size = 'md' }: Props) {
  const className = size === 'sm' ? 'select-sm' : 'select-md'
  return (
    <select aria-label="Modell" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={className}>
      {MODELS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  )
}
