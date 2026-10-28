import { describe, it, expect } from 'vitest'
import { artifactPath, artifactTitle, branchName, fileUrl, parseAppBranch } from './artifacts'
import { compareTicketKeys, isTicketKey } from './ticketKey'

describe('ticket keys', () => {
  it('accepts KEY-n keys only', () => {
    expect(isTicketKey('CB-3')).toBe(true)
    expect(isTicketKey('cb-3')).toBe(false)
    expect(isTicketKey('CB3')).toBe(false)
  })

  it('sorts by prefix, then numerically', () => {
    expect(['CB-10', 'AB-1', 'CB-2'].sort(compareTicketKeys)).toEqual(['AB-1', 'CB-2', 'CB-10'])
    expect(['CBA-1', 'CB-1'].sort(compareTicketKeys)).toEqual(['CB-1', 'CBA-1'])
  })
})

describe('artifact names', () => {
  it('builds path, branch and title per stage', () => {
    expect(artifactPath('CB-3', 'plan')).toBe('docs/work/CB-3/intent.md')
    expect(artifactPath('CB-3', 'design')).toBe('docs/work/CB-3/spec.md')
    expect(branchName('CB-3', 'plan')).toBe('CB-3/intent')
    expect(branchName('CB-3', 'design')).toBe('CB-3/spec')
    expect(artifactTitle('CB-3', 'plan')).toBe('CB-3: Intent')
    expect(artifactTitle('CB-3', 'design')).toBe('CB-3: Spec')
  })

  it('links the file on the given branch', () => {
    expect(fileUrl('https://github.com/o/r', 'showcase', 'docs/work/CB-3/intent.md'))
      .toBe('https://github.com/o/r/blob/showcase/docs/work/CB-3/intent.md')
    expect(fileUrl('https://github.com/o/r.git/', 'showcase', 'a.md')).toBe('https://github.com/o/r/blob/showcase/a.md')
  })
})

describe('parseAppBranch', () => {
  const known = new Set(['CB-1', 'CB-3'])

  it('recognises branches of known tickets', () => {
    expect(parseAppBranch('CB-3/intent', known)).toEqual({ key: 'CB-3', stage: 'plan' })
    expect(parseAppBranch('CB-1/spec', known)).toEqual({ key: 'CB-1', stage: 'design' })
  })

  it('ignores unknown tickets and foreign branches', () => {
    expect(parseAppBranch('CB-9/intent', known)).toBeNull()
    expect(parseAppBranch('feature/CB-3', known)).toBeNull()
    expect(parseAppBranch('CB-3/intent-old', known)).toBeNull()
    expect(parseAppBranch('cb-3/intent', known)).toBeNull()
  })
})
