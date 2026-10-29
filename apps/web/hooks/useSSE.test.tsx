import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from './useSSE'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
  }
}

const latest = () => FakeEventSource.instances.at(-1)!

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSSE', () => {
  it('connects to the ticket stream', () => {
    renderHook(() => useSSE('T-1', { onMessage: vi.fn() }))
    expect(latest().url).toBe('/api/events?ticketId=T-1')
  })

  it('passes every parsed event to onMessage and marks the connection', () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() => useSSE('T-1', { onMessage }))

    act(() => {
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketId: 'T-1', message: 'a' }) })
      latest().onmessage?.({ data: JSON.stringify({ type: 'progress', ticketId: 'T-1', message: 'b' }) })
    })

    expect(onMessage).toHaveBeenNthCalledWith(1, { type: 'progress', ticketId: 'T-1', message: 'a' })
    expect(onMessage).toHaveBeenNthCalledWith(2, { type: 'progress', ticketId: 'T-1', message: 'b' })
    expect(result.current).toEqual({ connected: true, everConnected: true })
  })

  it('calls onReconnect only when the connection opens again', () => {
    const onReconnect = vi.fn()
    renderHook(() => useSSE('T-1', { onMessage: vi.fn(), onReconnect }))

    act(() => latest().onopen?.())
    expect(onReconnect).not.toHaveBeenCalled()
    act(() => latest().onopen?.())
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it('reports a lost connection but remembers that it was connected', () => {
    const { result } = renderHook(() => useSSE('T-1', { onMessage: vi.fn() }))
    act(() => latest().onopen?.())
    act(() => latest().onerror?.())
    expect(result.current).toEqual({ connected: false, everConnected: true })
  })

  it('closes the connection on unmount and when the ticket changes', () => {
    const { rerender, unmount } = renderHook(({ id }) => useSSE(id, { onMessage: vi.fn() }), {
      initialProps: { id: 'T-1' },
    })
    const first = latest()
    rerender({ id: 'T-2' })
    expect(first.closed).toBe(true)
    expect(latest().url).toBe('/api/events?ticketId=T-2')
    unmount()
    expect(latest().closed).toBe(true)
  })
})
