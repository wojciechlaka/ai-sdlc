import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { anAuditEvent } from '@/test/fixtures'
import { LogList } from './LogList'

const LOG = [
  anAuditEvent('run_started', { stage: 'plan', trigger: 'initial', model: 'x' }),
  anAuditEvent('tool_used', { tool: 'Bash', target: 'git log -5' }, 'agent'),
  anAuditEvent('tool_used', { tool: 'Read', target: 'src/app.ts' }, 'agent'),
  anAuditEvent('tool_used', { tool: 'Grep', target: 'router' }, 'agent'),
  anAuditEvent('guard_blocked', { tool: 'Bash', target: 'rm -rf docs', reason: 'Befehl rm ist nicht erlaubt' }),
  anAuditEvent('tool_used', { tool: 'Read', target: 'README.md' }, 'agent'),
]

describe('LogList', () => {
  it('groups consecutive tool calls into one collapsible row', () => {
    render(<LogList log={LOG} />)
    const summary = screen.getByText('3 Werkzeugaufrufe')
    const details = summary.closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Bash `git log -5`')).toBeInTheDocument()
    expect(within(details).getByText('Read src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('1 Werkzeugaufruf')).toBeInTheDocument()
  })

  it('highlights blocked calls', () => {
    render(<LogList log={LOG} />)
    const text = screen.getByText('Blockiert: Bash `rm -rf docs` — Befehl rm ist nicht erlaubt')
    const row = text.closest('li')!
    expect(row).toHaveAttribute('data-blocked', 'true')
    expect(text).toHaveClass('text-red-700')
    expect(text.closest('details')).toBeNull()
  })

  it('shows a hint when there are no entries', () => {
    render(<LogList log={[]} />)
    expect(screen.getByText('Noch keine Einträge.')).toBeInTheDocument()
  })
})
