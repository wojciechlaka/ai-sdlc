import { describe, it, expect } from 'vitest'
import { parseToolEvent } from './hookLog'

describe('parseToolEvent', () => {
  it.each([
    ['{"kind":"used","tool":"Read","target":"a.ts","at":"x"}', { kind: 'used', tool: 'Read', target: 'a.ts' }],
    ['{"kind":"blocked","tool":"Bash","target":"rm x","reason":"nein"}', { kind: 'blocked', tool: 'Bash', target: 'rm x', reason: 'nein' }],
    ['{"kind":"used","tool":"Bash","target":"git status","exitCode":2}', { kind: 'used', tool: 'Bash', target: 'git status' }],
    ['{"kind":"other","tool":"Bash"}', null],
    ['{"kind":"used"}', null],
    ['kein json', null],
    ['', null],
  ])('parses %s', (line, expected) => {
    expect(parseToolEvent(line)).toEqual(expected)
  })
})
