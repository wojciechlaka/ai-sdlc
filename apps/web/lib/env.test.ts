import { describe, it, expect } from 'vitest'
import { positiveInt } from './env'

describe('positiveInt', () => {
  it.each([
    { value: undefined, expected: undefined },
    { value: '', expected: undefined },
    { value: 'zehn', expected: undefined },
    { value: '0', expected: undefined },
    { value: '-5', expected: undefined },
    { value: '600000', expected: 600000 },
  ])('reads $value as $expected', ({ value, expected }) => {
    expect(positiveInt(value)).toBe(expected)
  })
})
