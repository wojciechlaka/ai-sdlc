import { describe, it, expect } from 'vitest'
import { formatCost, formatDate, formatDateTime, formatElapsed, formatRuns, formatTokens } from './format'

describe('format', () => {
  it('formats date and time in German for Europe/Berlin', () => {
    const at = new Date('2026-01-15T12:03:04Z')
    expect(formatDateTime(at)).toBe('15.01.26, 13:03:04')
    expect(formatDate(at)).toBe('15.01.2026')
  })

  it('formats elapsed seconds', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(59)).toBe('59s')
    expect(formatElapsed(75)).toBe('1m 15s')
  })

  it('formats token counts', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5K')
    expect(formatTokens(2000)).toBe('2K')
  })

  it('formats costs', () => {
    expect(formatCost(0)).toBe('—')
    expect(formatCost(0.0005)).toBe('$0.000500')
    expect(formatCost(0.005)).toBe('$0.0050')
    expect(formatCost(1.234)).toBe('$1.23')
  })

  it('formats run counts in German singular and plural', () => {
    expect(formatRuns(0)).toBe('0 Läufe')
    expect(formatRuns(1)).toBe('1 Lauf')
    expect(formatRuns(4)).toBe('4 Läufe')
  })
})
