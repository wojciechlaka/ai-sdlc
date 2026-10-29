import { describe, it, expect } from 'vitest'
import { stripFrontMatter } from './markdown'

describe('stripFrontMatter', () => {
  it('removes the YAML header only', () => {
    expect(stripFrontMatter('---\na: b\n---\n\n# T\n')).toBe('# T\n')
    expect(stripFrontMatter('# T\n---\n')).toBe('# T\n---\n')
  })
})
