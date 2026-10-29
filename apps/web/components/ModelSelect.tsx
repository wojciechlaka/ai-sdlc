import { MODEL_IDS, MODELS, isModelId, type ModelId } from '@/lib/models'

interface Props {
  value: ModelId
  onChange: (model: ModelId) => void
  /** Disables the select while an action is pending. */
  disabled?: boolean
  /** 'sm' renders a compact inline variant; 'md' (default) renders full-width. */
  size?: 'sm' | 'md'
}

/**
 * Dropdown for picking the Claude model of a stage run, one option per entry of the model table.
 * No `'use client'`: it takes a function prop, so it is rendered only inside client components (TicketActions).
 */
export function ModelSelect({ value, onChange, disabled = false, size = 'md' }: Props) {
  const className = size === 'sm' ? 'select-sm' : 'select-md'
  return (
    <select
      aria-label="Modell"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (isModelId(e.target.value)) onChange(e.target.value)
      }}
      className={className}
    >
      {MODEL_IDS.map((id) => (
        <option key={id} value={id}>
          {MODELS[id].label}
        </option>
      ))}
    </select>
  )
}
