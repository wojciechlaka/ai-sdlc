import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useElapsedSeconds } from './useElapsedSeconds'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useElapsedSeconds', () => {
  it('stays at 0 while not running', () => {
    const { result } = renderHook(() => useElapsedSeconds(false))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('counts whole seconds while running', () => {
    const { result } = renderHook(() => useElapsedSeconds(true))
    act(() => vi.advanceTimersByTime(2500))
    expect(result.current).toBe(2)
  })

  it('starts again from 0 after a stop', () => {
    const { result, rerender } = renderHook(({ running }) => useElapsedSeconds(running), { initialProps: { running: true } })
    act(() => vi.advanceTimersByTime(3000))
    rerender({ running: false })
    expect(result.current).toBe(0)
    rerender({ running: true })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(1)
  })
})
