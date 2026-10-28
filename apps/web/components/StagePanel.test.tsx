import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { StageViewDto } from '@refinement/shared'
import { StagePanel, stripFrontMatter } from './StagePanel'

const DONE: StageViewDto = {
  stage: 'plan',
  path: 'docs/work/CB-2/intent.md',
  fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-2/intent.md',
  completed: true,
  pr: { number: 1, url: 'https://github.com/o/r/pull/1', state: 'merged' },
  mergedAt: new Date('2026-10-28T12:00:00Z'),
  content: '---\nticket: CB-2\nstage: plan\n---\n\n# CB-2: Lesezeit anzeigen\n\n## Problem\n\nLeser wissen es nicht.\n',
}

const OPEN: StageViewDto = {
  stage: 'design', path: 'docs/work/CB-2/spec.md', fileUrl: 'https://github.com/o/r/blob/HEAD/docs/work/CB-2/spec.md',
  completed: false, pr: null, mergedAt: null, content: null,
}

describe('StagePanel', () => {
  it('links file and PR of a completed stage', () => {
    render(<StagePanel view={DONE} />)
    expect(screen.getByLabelText('abgeschlossen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'docs/work/CB-2/intent.md' })).toHaveAttribute('href', DONE.fileUrl)
    expect(screen.getByRole('link', { name: 'PR #1 (gemergt)' })).toHaveAttribute('href', 'https://github.com/o/r/pull/1')
  })

  it('shows the content without front matter on demand', () => {
    render(<StagePanel view={DONE} />)
    expect(screen.queryByRole('heading', { name: 'CB-2: Lesezeit anzeigen' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Inhalt anzeigen' }))
    expect(screen.getByRole('heading', { name: 'CB-2: Lesezeit anzeigen' })).toBeInTheDocument()
    expect(screen.queryByText(/ticket: CB-2/)).toBeNull()
  })

  it('shows an open stage without links and content', () => {
    render(<StagePanel view={OPEN} />)
    expect(screen.getByLabelText('offen')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('stripFrontMatter', () => {
  it('removes the YAML header only', () => {
    expect(stripFrontMatter('---\na: b\n---\n\n# T\n')).toBe('# T\n')
    expect(stripFrontMatter('# T\n---\n')).toBe('# T\n---\n')
  })
})
