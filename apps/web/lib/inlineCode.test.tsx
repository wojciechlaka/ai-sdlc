import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { inlineCode } from './inlineCode'

function html(text: string): string {
  const { container } = render(<p>{inlineCode(text)}</p>)
  return container.innerHTML
}

describe('inlineCode', () => {
  it('returns plain text unchanged', () => {
    expect(html('kein Code')).toBe('<p>kein Code</p>')
  })

  it('renders backtick pairs as code elements', () => {
    expect(html('Setze `draft=true` und `x`.')).toBe('<p>Setze <code class="rounded bg-slate-100 px-1 font-mono text-[0.9em]">draft=true</code> und <code class="rounded bg-slate-100 px-1 font-mono text-[0.9em]">x</code>.</p>')
  })

  it('keeps an unpaired backtick as text', () => {
    expect(html('a ` b')).toBe('<p>a ` b</p>')
    expect(html('`a` und ` b')).toContain('und ` b')
  })

  it('keeps empty pairs as text', () => {
    expect(html('a `` b')).toBe('<p>a `` b</p>')
  })
})
