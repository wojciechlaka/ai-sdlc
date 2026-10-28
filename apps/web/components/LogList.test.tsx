import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { AuditEventDto } from '@refinement/shared'
import { LogList } from './LogList'

const at = new Date('2026-10-28T10:00:00Z')
const entry = (type: string, payload: unknown, actor: AuditEventDto['actor'] = 'system'): AuditEventDto => ({ actor, type, payload, createdAt: at })

const LOG = [
  entry('run_started', { stage: 'plan', trigger: 'initial', model: 'x' }),
  entry('tool_used', { tool: 'Bash', target: 'git log -5', exitCode: 0 }, 'agent'),
  entry('tool_used', { tool: 'Read', target: 'src/app.ts' }, 'agent'),
  entry('tool_used', { tool: 'Grep', target: 'router' }, 'agent'),
  entry('guard_blocked', { tool: 'Bash', target: 'rm -rf docs', reason: 'Befehl rm ist nicht erlaubt' }),
  entry('tool_used', { tool: 'Read', target: 'README.md' }, 'agent'),
]

describe('LogList', () => {
  it('fasst aufeinanderfolgende Werkzeugaufrufe in einer aufklappbaren Zeile zusammen', () => {
    render(<LogList log={LOG} />)
    const summary = screen.getByText('3 Werkzeugaufrufe')
    const details = summary.closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Bash `git log -5`')).toBeInTheDocument()
    expect(within(details).getByText('Read src/app.ts')).toBeInTheDocument()
    expect(screen.getByText('1 Werkzeugaufruf')).toBeInTheDocument()
  })

  it('hebt blockierte Aufrufe hervor', () => {
    render(<LogList log={LOG} />)
    const text = screen.getByText('Blockiert: Bash `rm -rf docs` — Befehl rm ist nicht erlaubt')
    const row = text.closest('li')!
    expect(row).toHaveAttribute('data-blocked', 'true')
    expect(text).toHaveClass('text-red-700')
    expect(text.closest('details')).toBeNull()
  })

  it('zeigt einen Hinweis ohne Einträge', () => {
    render(<LogList log={[]} />)
    expect(screen.getByText('Noch keine Einträge.')).toBeInTheDocument()
  })
})
